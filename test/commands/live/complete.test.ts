import {expect, test} from '@oclif/test'

describe('live:complete', () => {
  test
  .stdout()
  .command(['live:complete'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['live:complete', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
