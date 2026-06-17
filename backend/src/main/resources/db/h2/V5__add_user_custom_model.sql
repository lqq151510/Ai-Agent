-- 对齐 PostgreSQL V5__add_user_custom_model.sql
-- 用户自定义模型配置（base_url 和 api_key），api_key 通过 StringCryptoTypeHandler 加密存储
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_base_url VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_api_key VARCHAR(255);
