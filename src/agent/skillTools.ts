import { tool } from 'ai'
import { z } from 'zod'
import { loadSkill, readSkillFile } from './skills'

export const skillTools = {
  load_skill: tool({
    description: 'Load a skill\'s instructions when the user\'s request matches that skill. Returns the skill directory and the SKILL.md body. Full instructions stay out of context until this is called.',
    inputSchema: z.object({
      name: z.string().describe('Skill name from the available-skills list'),
    }),
    execute: async ({ name }) => loadSkill(name),
  }),

  read_skill_file: tool({
    description: 'Read a file bundled with a skill, such as reference.md. Path is the skill directory plus the relative path, e.g. tabs/reference.md.',
    inputSchema: z.object({
      path: z.string().describe('Path like tabs/reference.md'),
    }),
    execute: async ({ path }) => readSkillFile(path),
  }),
}
