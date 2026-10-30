# Tab workflows

## Close every tab from one site

User: "Close all tabs from github.com"

1. `list_tabs` with `domain="github.com"`
2. Show the matches
3. Ask whether to close them
4. `close_tabs` with those ids (`safe=true`)

## Organize open tabs

User: "Organize my tabs"

1. `list_tabs` with a high `limit`
2. Propose groups by domain or topic (name, color, tab count); skip pinned tabs and singletons
3. Ask whether to create them
4. `create_tab_group` once per group

## Archive idle tabs

1. `archive_inactive` with `preview=true` and the inactivity threshold in hours
2. Show which tabs would be archived
3. On yes, run again with `preview=false`

## Undo a close

1. `list_closed_tabs`
2. `restore_tab` with the trash item id
