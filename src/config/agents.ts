import cortexAvatar from '../renderer/assets/avatars/cortex.webp';
import ziggyAvatar from '../renderer/assets/avatars/ziggy.webp';
import patchyAvatar from '../renderer/assets/avatars/patchy.webp';
import shinyAvatar from '../renderer/assets/avatars/shiny.webp';
import sniffyAvatar from '../renderer/assets/avatars/sniffy.webp';
import trappyAvatar from '../renderer/assets/avatars/trappy.webp';
import scratchyAvatar from '../renderer/assets/avatars/scratchy.webp';
import wheelieAvatar from '../renderer/assets/avatars/wheelie.webp';
import clawsyAvatar from '../renderer/assets/avatars/clawsy.webp';
import nestorAvatar from '../renderer/assets/avatars/nestor.webp';
import quillAvatar from '../renderer/assets/avatars/quill.webp';
import switchyAvatar from '../renderer/assets/avatars/switchy.webp';
import sketchyAvatar from '../renderer/assets/avatars/sketchy.webp';

export interface Agent {
  id: string;
  name: string;
  title: string;
  icon: string;
  colorAccent: string;
  avatar: string;
  description: string;
}

export const agents: Agent[] = [
  {
    id: 'cortex',
    name: 'Cortex',
    title: 'Product Owner',
    icon: '🧠',
    colorAccent: '#4299e1', // light blue
    avatar: cortexAvatar,
    description: 'The brilliant strategist who sees the big picture and transforms ideas into actionable roadmaps.',
  },
  {
    id: 'switchy',
    name: 'Switchy',
    title: 'Single-Agent Assistant',
    icon: '🔄',
    colorAccent: '#10b981', // emerald green
    avatar: switchyAvatar,
    description: 'The adaptable all-rounder who seamlessly switches between any role when the team is offline.',
  },
  {
    id: 'ziggy',
    name: 'Ziggy',
    title: 'Chaos Monkey',
    icon: '🐒',
    colorAccent: '#ed8936', // orange
    avatar: ziggyAvatar,
    description: 'The mischievous troublemaker who breaks things on purpose to make them stronger.',
  },
  {
    id: 'patchy',
    name: 'Patchy',
    title: 'Backend Developer',
    icon: '🔧',
    colorAccent: '#38a169', // dark green
    avatar: patchyAvatar,
    description: 'The reliable workhorse who builds rock-solid foundations and never backs down from a challenge.',
  },
  {
    id: 'shiny',
    name: 'Shiny',
    title: 'Frontend Developer',
    icon: '🎨',
    colorAccent: '#ed64a6', // pink
    avatar: shinyAvatar,
    description: 'The perfectionist artist who crafts beautiful, pixel-perfect interfaces that users love.',
  },
  {
    id: 'sniffy',
    name: 'Sniffy',
    title: 'Quality Engineer',
    icon: '🐁',
    colorAccent: '#9f7aea', // lavender
    avatar: sniffyAvatar,
    description: 'The detail-oriented detective who sniffs out bugs before they can cause trouble.',
  },
  {
    id: 'trappy',
    name: 'Trappy',
    title: 'Security Auditor',
    icon: '🔒',
    colorAccent: '#4299e1', // steel blue
    avatar: trappyAvatar,
    description: 'The vigilant guardian who sets clever traps for hackers and keeps your data safe.',
  },
  {
    id: 'scratchy',
    name: 'Scratchy',
    title: 'Contrarian Analyst',
    icon: '🤔',
    colorAccent: '#e53e3e', // red
    avatar: scratchyAvatar,
    description: 'The skeptical critic who questions everything and makes ideas stronger through constructive doubt.',
  },
  {
    id: 'wheelie',
    name: 'Wheelie',
    title: 'Platform/DevOps',
    icon: '⚙️',
    colorAccent: '#38b2ac', // teal
    avatar: wheelieAvatar,
    description: 'The energetic optimizer who keeps everything running smoothly and never stops moving.',
  },
  {
    id: 'clawsy',
    name: 'Clawsy',
    title: 'Code Reviewer',
    icon: '🧐',
    colorAccent: '#9b2c2c', // burgundy
    avatar: clawsyAvatar,
    description: 'The sharp-eyed perfectionist who wields their red pen with precision and fairness.',
  },
  {
    id: 'nestor',
    name: 'Nestor',
    title: 'Architect',
    icon: '🏗',
    colorAccent: '#4c51bf', // navy
    avatar: nestorAvatar,
    description: 'The wise elder who designs elegant systems that stand the test of time.',
  },
  {
    id: 'quill',
    name: 'Quill',
    title: 'Document Writer',
    icon: '✍️',
    colorAccent: '#f7fafc', // cream
    avatar: quillAvatar,
    description: 'The thoughtful wordsmith who turns complex technical concepts into clear, beautiful prose.',
  },
  {
    id: 'sketchy',
    name: 'Sketchy',
    title: 'UI/UX Designer',
    icon: '🎨',
    colorAccent: '#14b8a6', // teal
    avatar: sketchyAvatar,
    description: 'The creative visionary who sketches user experiences from the heart and designs with empathy.',
  },
]; 