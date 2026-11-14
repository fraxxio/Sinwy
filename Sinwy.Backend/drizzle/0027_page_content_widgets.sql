UPDATE "page_content"
SET "content" = ("content" - 'blocks') || jsonb_build_object('widgets', "content" -> 'blocks')
WHERE "content" ? 'blocks';
