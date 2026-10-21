// ลงทะเบียนโมดูลโปรเจคกับโครงหลัก
import { registerModule } from '../../ui/shell.js';
import { createProjectsView } from './view.js';
import { seedProjects, clearProjectExamples } from './actions.js';

let view = null;

registerModule({
  id: 'projects',
  label: 'โปรเจค',
  icon: 'target',
  mount(container, ctx, params) { view = createProjectsView(container, ctx, params); },
  unmount() { view?.destroy(); view = null; },
  seed(ctx) { return seedProjects(ctx.store); },
  clearExamples(ctx) { return clearProjectExamples(ctx.store); },
});
