import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AssertConfigDialog from './AssertConfigDialog.vue'
import { createPinia, setActivePinia } from 'pinia'

// Mock Naive UI components
vi.mock('naive-ui', () => ({
  NModal: {
    template: `
      <div class="n-modal">
        <div class="title">{{ title }}</div>
        <slot />
        <slot name="action" />
      </div>
    `,
    props: ['title', 'show']
  },
  NFormItem: {
    template: '<div class="n-form-item"><label>{{ label }}</label><slot /></div>',
    props: ['label']
  },
  NDivider: { template: '<div class="n-divider"><slot /></div>' },
  NInputNumber: { template: '<input class="n-input-number" :value="value" @input="$emit(\'update:value\', Number($event.target.value))" />', props: ['value'] },
  NInput: { template: '<input class="n-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value'] },
  NSelect: { template: '<select class="n-select" :value="value" @change="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'options'] },
  NTag: { template: '<span class="n-tag"><slot /></span>' },
  NButton: { template: '<button class="n-button" @click="$emit(\'click\')"><slot /></button>' },
  NSpace: { template: '<div class="n-space"><slot /></div>' },
  NSwitch: { template: '<input type="checkbox" class="n-switch" />' },
  NRadioGroup: { template: '<div class="n-radio-group"><slot /></div>' },
  NRadio: { template: '<label class="n-radio"><input type="radio" :value="value" /> <slot /></label>', props: ['value'] },
}))

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock i18n store
vi.mock('@/stores/i18n', () => ({
  useI18nStore: () => ({
    t: {
      common: { save: 'Save', cancel: 'Cancel' },
      actions: {
        failureControl: { title: 'Failure Control' },
        stop: 'Stop',
        continue: 'Continue',
      }
    }
  })
}))

describe('AssertConfigDialog.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders failure control options', async () => {
    const wrapper = mount(AssertConfigDialog)

    // Initially visible is false, so we need to call show()
    const vm = wrapper.vm as any
    vm.show()
    await wrapper.vm.$nextTick()

    // Debug
    if (!wrapper.text()) {
        console.log('Wrapper HTML:', wrapper.html())
    }

    expect(wrapper.text()).toContain('Failure Control')
    expect(wrapper.text()).toContain('执行失败时停止回放')
  })

  it('resets failure behavior on reset', async () => {
    const wrapper = mount(AssertConfigDialog)
    const vm = wrapper.vm as any

    vm.stopOnFailure = false
    vm.reset()

    expect(vm.stopOnFailure).toBe(true)
  })

  it('loads failure behavior from action in edit mode', async () => {
    const wrapper = mount(AssertConfigDialog)
    const vm = wrapper.vm as any

    const action = {
        type: 'assert',
        id: '1',
        params: { conditions: [], operator: 'and' },
        onFailure: 'continue',
    }

    vm.edit(action)
    expect(vm.stopOnFailure).toBe(false)
  })

  it('emits confirm with failure config', async () => {
     const wrapper = mount(AssertConfigDialog)
    const vm = wrapper.vm as any
    vm.show()

    // Add a condition to enable confirm button
    vm.addCondition({ type: 'element', selector: { xpath: '//btn' }, expect: 'exists' })
    vm.stopOnFailure = false

    // Trigger handleConfirm directly
    vm.handleConfirm()

    expect(wrapper.emitted('confirm')).toBeTruthy()
  })
})
