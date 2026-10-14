import conventional from '@commitlint/config-conventional';

const genericSubjects = new Set(['change', 'changes', 'fix', 'misc', 'stuff', 'temp', 'temporary', 'update', 'updates', 'wip']);

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [{
    rules: {
      'subject-not-generic': ({subject = ''}) => {
        const normalized = subject.trim().toLowerCase().replace(/[.!]+$/, '');
        return [
          normalized.length > 3 && !genericSubjects.has(normalized) && !/^wip(?:\b|:)/i.test(normalized),
          'subject must describe the concrete change; avoid WIP or generic wording',
        ];
      },
    },
  }],
  rules: {
    ...conventional.rules,
    'header-max-length': [2, 'always', 100],
    'subject-not-generic': [2, 'always'],
    'type-enum': [2, 'always', ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test']],
  },
};
