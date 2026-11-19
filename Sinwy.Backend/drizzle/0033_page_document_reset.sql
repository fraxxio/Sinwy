-- Every stored page becomes an empty page document; versions and the published pointer stay.
UPDATE "page_content"
SET "content" = '{"schemaVersion":2,"data":{"root":{"props":{}},"content":[]}}'::jsonb;
