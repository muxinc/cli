import {expect, test} from '@oclif/test'

describe('assets:create', () => {
  test
    .stdout()
    .command(['assets:create'])
    .it('runs hello', ctx => {
      expect(ctx.stdout).to.contain('hello world')
    })

  test
    .stdout()
    .command(['assets:create', '--name', 'jeff'])
    .it('runs hello --name jeff', ctx => {
      expect(ctx.stdout).to.contain('hello jeff')
    })
})
