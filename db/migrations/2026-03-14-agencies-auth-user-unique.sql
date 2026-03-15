ALTER TABLE agencies
ADD CONSTRAINT agencies_auth_user_unique UNIQUE (auth_user_id);
