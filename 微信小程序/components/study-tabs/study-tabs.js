const { openMain } = require('../../utils/navigation')
Component({
  properties: { active: { type: String, value: 'home' } },
  methods: { open(e) { openMain(e.currentTarget.dataset.page) } }
})
