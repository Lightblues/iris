import { migrate, pgDb } from './store.ts'
import { addToken, addUser, CREDENTIAL_KINDS, listTokens, listUsers, revokeToken, type CredentialKind } from './users.ts'

const USAGE = `usage:
  pnpm run user add <id> [name]
  pnpm run user list
  pnpm run token add <user> <${CREDENTIAL_KINDS.join('|')}> [label]   prints the token once
  pnpm run token list [user]
  pnpm run token revoke <credential id>`

async function main(args: string[]) {
  const url = process.env.IRIS_DATABASE_URL
  if (!url) throw new Error('IRIS_DATABASE_URL is required (read from .env)')
  const db = pgDb(url)
  try {
    await migrate(db)
    const [group, action, ...rest] = args
    const date = (ms: number | null) => ms == null ? '' : new Date(ms).toISOString().slice(0, 10)
    if (group === 'user' && action === 'add' && rest[0]) {
      await addUser(db, rest[0], rest[1])
      console.log(`added user ${rest[0]}`)
    } else if (group === 'user' && action === 'list') {
      for (const user of await listUsers(db)) console.log(`${user.id}\t${user.name}\t${date(user.createdAt)}`)
    } else if (group === 'token' && action === 'add' && rest[0] && rest[1]) {
      console.log(await addToken(db, rest[0], rest[1] as CredentialKind, rest[2]))
    } else if (group === 'token' && action === 'list') {
      for (const cred of await listTokens(db, rest[0])) {
        console.log(`${cred.id}\t${cred.userId}\t${cred.kind}\t${cred.label}\t${date(cred.createdAt)}${cred.revokedAt ? `\trevoked ${date(cred.revokedAt)}` : ''}`)
      }
    } else if (group === 'token' && action === 'revoke' && Number(rest[0])) {
      console.log(await revokeToken(db, Number(rest[0])) ? 'revoked' : 'no live credential with that id')
    } else {
      console.error(USAGE)
      process.exitCode = 2
    }
  } finally {
    await db.close()
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error((error as Error).message)
  process.exit(1)
})
