/**
 * Character card prompt rendering, ported from the original moxia `prompts/character_card.py` + template.
 * Pure local template rendering — no external LLM API calls. Users must manually copy the result
 * to an external AI tool.
 */
import type { BookMeta, Character, CharacterRelation } from './types';
import { renderTemplate } from './promptEngine';

interface BookLike {
  title: string;
  genre: string;
  worldbuilding: string;
  description: string;
}

interface CharacterLike {
  name: string;
  roleType: string;
  description: string;
  personality: string;
  background: string;
}

interface RelationLike {
  name: string;
  relationType: string;
  description: string;
  direction: 'outgoing' | 'incoming' | '';
}

const MODE_LABELS: Record<string, string> = {
  create: '自动生成',
  refine: '在已有基础上扩展',
};

const NAME_STRATEGIES: Record<string, string> = {
  create: '请根据预期自动构思一个合适的名字',
  refine: '保留原角色名称，如确有必要再行更名',
};

const NAME_REQUIREMENTS: Record<string, string> = {
  create: '角色名称与所有设定均由你自动生成，不要让用户手动填写。',
  refine: '在保留原角色核心设定的前提下进行扩展，不要推翻已有设定。',
};

function formatCharacterList(chars: CharacterLike[]): string {
  const blocks = chars.map((c, idx) => {
    const lines = [`${idx + 1}. ${c.name}`];
    if (c.roleType.trim()) lines.push(`   - 类型：${c.roleType}`);
    if (c.description.trim()) lines.push(`   - 描述：${c.description}`);
    if (c.personality.trim()) lines.push(`   - 性格：${c.personality}`);
    if (c.background.trim()) lines.push(`   - 背景：${c.background}`);
    return lines.join('\n');
  });
  return blocks.join('\n\n');
}

function formatRelationList(relations: RelationLike[]): string {
  return relations
    .map((r) => {
      const name = r.name || '未知';
      const rtype = r.relationType.trim();
      const desc = r.description.trim();
      let dirLabel = '';
      if (r.direction === 'outgoing') dirLabel = '，出';
      else if (r.direction === 'incoming') dirLabel = '，入';
      const head = `- ${name}${rtype ? `（${rtype}${dirLabel}）` : ''}`;
      return desc ? `${head}：${desc}` : head;
    })
    .join('\n');
}

// The template is loaded asynchronously from `public/prompts/character_card_template.txt` and
// cached in a module-level variable. This way the template can be edited independently without
// touching code, and additional templates can be added later.
const TEMPLATE_URL = `${import.meta.env.BASE_URL}prompts/character_card_template.txt`;
let templateCache: string | null = null;

async function loadTemplate(): Promise<string> {
  if (templateCache !== null) return templateCache;
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) {
    throw new Error(`load character_card_template failed: ${res.status} ${res.statusText}`);
  }
  templateCache = await res.text();
  return templateCache;
}

export interface RenderCharacterCardParams {
  userExpectation: string;
  roleType?: string;
  mode?: 'create' | 'refine';
  book: BookLike;
  existingCharacters?: CharacterLike[];
  character?: CharacterLike;
  existingRelations?: RelationLike[];
  roleTypeOptions?: string[];
  relationTypeOptions?: string[];
  referenceCharacter?: CharacterLike;
  referenceRelationType?: string;
}

export async function renderCharacterCard({
  userExpectation,
  roleType = '',
  mode = 'create',
  book,
  existingCharacters,
  character,
  existingRelations,
  roleTypeOptions,
  relationTypeOptions,
  referenceCharacter,
  referenceRelationType = '',
}: RenderCharacterCardParams): Promise<string> {
  if (!book) throw new Error('生成角色卡需要先选择一本书。');

  const expectation = (userExpectation || '').trim() || '（请在此处填写你对角色的预期描述）';
  const role = (roleType || '').trim() || '根据上下文自动判断';
  const modeKey = mode in MODE_LABELS ? mode : 'create';

  const roleTypeList = roleTypeOptions ?? [];
  const relationTypeList = relationTypeOptions ?? [];
  const roleTypeHint = roleTypeList.length
    ? `（若为"根据上下文自动判断"，请从 ${roleTypeList.join(' / ')} 中自行选择一个最合适的）`
    : '';
  const relationTypeHint = relationTypeList.length ? `（${relationTypeList.join(' / ')}）` : '';

  const ctx: Record<string, string> = {
    user_expectation: expectation,
    role_type: role,
    role_type_hint: roleTypeHint,
    relation_type_hint: relationTypeHint,
    mode_label: MODE_LABELS[modeKey],
    name_strategy: NAME_STRATEGIES[modeKey],
    name_requirement: NAME_REQUIREMENTS[modeKey],
    book_title: book.title || '',
    book_genre: book.genre || '',
    book_worldbuilding: book.worldbuilding || '',
    book_description: book.description || '',
  };

  if (existingCharacters?.length) {
    ctx.existing_characters = formatCharacterList(existingCharacters);
  }

  if (character) {
    ctx.character_name = character.name || '';
    ctx.character_role_type = character.roleType || '';
    ctx.character_description = character.description || '';
    ctx.character_personality = character.personality || '';
    ctx.character_background = character.background || '';
  }

  if (existingRelations?.length) {
    ctx.existing_relations = formatRelationList(existingRelations);
  }

  if (referenceCharacter) {
    ctx.reference_character_name = referenceCharacter.name || '';
    ctx.reference_relation_type = (referenceRelationType || '').trim();
  }

  const template = await loadTemplate();
  return renderTemplate(template, ctx);
}

/** Converts `CharacterRelation[]` to `RelationLike[]` (computes direction + name). */
export function relationsToLike(relations: CharacterRelation[], currentCharacterId: number): RelationLike[] {
  return relations.map((r) => {
    const direction: RelationLike['direction'] = r.characterId === currentCharacterId ? 'outgoing' : 'incoming';
    return {
      name: r.relatedName,
      relationType: r.relationType,
      description: r.description,
      direction,
    };
  });
}

/** Converts `Character` to `CharacterLike`. */
export function characterToLike(c: Character): CharacterLike {
  return {
    name: c.name,
    roleType: c.roleType,
    description: c.description,
    personality: c.personality,
    background: c.background,
  };
}

/** Converts `BookMeta` to `BookLike`. */
export function bookToLike(b: BookMeta): BookLike {
  return {
    title: b.title,
    genre: b.genre,
    worldbuilding: b.worldbuilding,
    description: b.description,
  };
}
