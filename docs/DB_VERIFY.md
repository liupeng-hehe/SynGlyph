# Verify data in database

`color_annotation` table has no `created_at`. Use these commands:

```bash
# Check annotations (has created_at)
psql -d synglyph -c "SELECT id, stimulus_id, created_at FROM annotation ORDER BY created_at DESC LIMIT 5;"

# Check color_annotation
psql -d synglyph -c "SELECT id, annotation_id, target_type, hex_color FROM color_annotation LIMIT 10;"

# Check stimuli
psql -d synglyph -c "SELECT id, text FROM stimulus LIMIT 10;"
```
