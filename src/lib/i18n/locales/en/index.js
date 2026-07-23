// English reference pack — the source of truth for all keys.
// Organized by module; export each module for professional-translator handoff.
import common from './common';
import editor from './editor';
import projects from './projects';
import recipes from './recipes';
import workspace from './workspace';
import automation from './automation';
import fashion from './fashion';
import billing from './billing';
import settings from './settings';
import errors from './errors';
import notifications from './notifications';
import jobs from './jobs';
import creative from './creative';
import brand from './brand';
import assets from './assets';

export const modules = { common, editor, projects, recipes, workspace, automation, fashion, billing, settings, errors, notifications, jobs, creative, brand, assets };
export default modules;