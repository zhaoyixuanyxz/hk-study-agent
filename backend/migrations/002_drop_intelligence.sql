-- 移除「香港留学情报」Postgres 模块后的表清理（若曾部署过 001_intelligence.sql）。可安全多次执行。
DROP TABLE IF EXISTS intelligence_items CASCADE;
DROP TABLE IF EXISTS intelligence_feeds CASCADE;
DROP TABLE IF EXISTS intel_follows CASCADE;
DROP TABLE IF EXISTS intel_user_prefs CASCADE;
DROP TABLE IF EXISTS intel_reviewers CASCADE;
DROP TABLE IF EXISTS intelligence_sources CASCADE;
