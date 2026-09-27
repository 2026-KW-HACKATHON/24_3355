#!/bin/sh
# Postgres 데이터 폴더가 처음 만들어질 때 한 번만 실행됩니다.
# dev와 prod가 같은 Postgres를 쓰되, 데이터베이스와 계정은 따로 둡니다.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE wolgyeham_dev LOGIN PASSWORD '${DEV_DB_PASSWORD}';
CREATE DATABASE wolgyeham_dev OWNER wolgyeham_dev;
CREATE ROLE wolgyeham_prod LOGIN PASSWORD '${PROD_DB_PASSWORD}';
CREATE DATABASE wolgyeham_prod OWNER wolgyeham_prod;
REVOKE ALL ON DATABASE wolgyeham_dev FROM PUBLIC;
REVOKE ALL ON DATABASE wolgyeham_prod FROM PUBLIC;
SQL
