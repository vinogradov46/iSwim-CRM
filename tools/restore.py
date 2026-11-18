#!/usr/bin/env python3
"""Восстановление iSwim CRM из ночной копии (iswim-backup-ГГГГ-ММ-ДД.json.gz) в НОВЫЙ пустой проект Supabase.

Использование:
  pip install psycopg2-binary
  python3 tools/restore.py iswim-backup-2026-11-18.json.gz \
      --db "postgresql://postgres:ПАРОЛЬ@db.НОВЫЙ_REF.supabase.co:5432/postgres" \
      --old-ref rpvzjqlhihphspaxocqx --new-ref НОВЫЙ_REF [--dry-run]

Что делает: 1) применяет все миграции по порядку (схема, функции, правила доступа);
2) переносит логины сотрудников (auth); 3) заливает данные всех таблиц; 4) возвращает расписание ночных задач.
Дальше вручную: задеплоить функции из supabase/functions, задать секрет TELEGRAM_BOT_TOKEN, см. docs/ВОССТАНОВЛЕНИЕ.md.
"""
import argparse, gzip, json, sys

ap = argparse.ArgumentParser()
ap.add_argument('backup')
ap.add_argument('--db', required=False)
ap.add_argument('--old-ref', required=True)
ap.add_argument('--new-ref', required=True)
ap.add_argument('--dry-run', action='store_true')
a = ap.parse_args()

dump = json.load(gzip.open(a.backup, 'rt', encoding='utf-8'))
tables, system = dump['tables'], dump.get('system', {})
migs = system.get('migrations', [])
if not migs:
    sys.exit('В копии нет миграций (старый формат). Нужна копия от 18.11.2026 или новее.')

print(f"Копия от {dump['taken_at']}: миграций {len(migs)}, таблиц {len(tables)}, строк {sum(len(v) for v in tables.values())}")
for t, rows in sorted(tables.items()):
    print(f"  {t}: {len(rows)}")
print(f"  auth.users: {len(system.get('auth_users', []))}, cron-задач: {len(system.get('cron', []))}")
if a.dry_run:
    sys.exit(0)
if not a.db:
    sys.exit('Укажите --db')

import psycopg2
from psycopg2.extras import Json

con = psycopg2.connect(a.db)
con.autocommit = False
cur = con.cursor()

def fix(s: str) -> str:
    return s.replace(a.old_ref, a.new_ref)

print('1/4 Миграции…')
for m in migs:
    for st in m['statements']:
        try:
            cur.execute('savepoint s')
            cur.execute(fix(st))
            cur.execute('release savepoint s')
        except Exception as e:
            cur.execute('rollback to savepoint s')
            print(f"  ! {m['version']} {m['name']}: {str(e).splitlines()[0]}")
con.commit()

cur.execute("set session_replication_role = replica")

print('2/4 Логины сотрудников…')
for tbl, key in (('auth.users', 'auth_users'), ('auth.identities', 'auth_identities')):
    rows = system.get(key, [])
    if rows:
        cur.execute(f"insert into {tbl} select * from jsonb_populate_recordset(null::{tbl}, %s::jsonb) on conflict do nothing", (Json(rows),))
        print(f"  {tbl}: {len(rows)}")

print('3/4 Данные…')
cur.execute("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
existing = {r[0] for r in cur.fetchall()}
for t, rows in tables.items():
    if t not in existing:
        print(f"  ! таблицы {t} нет в новой базе — пропуск"); continue
    cur.execute(f'truncate public."{t}" cascade')
    if rows:
        cur.execute(f'insert into public."{t}" select * from jsonb_populate_recordset(null::public."{t}", %s::jsonb)', (Json(rows),))
    print(f"  {t}: {len(rows)}")

for k in system.get('private_app_keys', []):
    cur.execute("insert into private.app_keys(k, v) values (%s, %s) on conflict (k) do update set v = excluded.v", (k['k'], k['v']))

cur.execute("insert into private.app_keys(k, v) select 'cron_key', encode(extensions.gen_random_bytes(24), 'hex') where not exists (select 1 from private.app_keys where k = 'cron_key')")

print('4/4 Ночные задачи…')
for j in system.get('cron', []):
    cur.execute("select cron.schedule(%s, %s, %s)", (j['jobname'], j['schedule'], fix(j['command'])))
    print(f"  {j['jobname']}: {j['schedule']}")
con.commit()
print('Готово. Теперь: задеплоить функции и задать TELEGRAM_BOT_TOKEN (docs/ВОССТАНОВЛЕНИЕ.md).')
