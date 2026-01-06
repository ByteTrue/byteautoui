import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AssertConfigDialog from './AssertConfigDialog.vue'
import { createPinia, setActivePinia } from 'pinia'
import { NModal } from 'naive-ui'

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
        failureControl: 'Failure Control',
        onExecuteFailure: 'On Execute Failure',
        onAssertFailure: 'On Assert Failure',
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
    const wrapper = shallowMount(AssertConfigDialog, {
      global: {
        stubs: {
          NModal: {
            template: '<div><slot /><slot name="action" /></div>',
            props: ['show']
          }
        }
      }
    })

    // Initially visible is false, so we need to call show()
    const vm = wrapper.vm as any
    vm.show()
    await wrapper.vm.$nextTick()
    
    // Debug
    if (!wrapper.text()) {
        console.log('Wrapper HTML:', wrapper.html())
    }

    expect(wrapper.text()).toContain('Failure Control')
    expect(wrapper.text()).toContain('On Execute Failure')
    expect(wrapper.text()).toContain('On Assert Failure')
  })

  it('resets failure behavior on reset', async () => {
    const wrapper = shallowMount(AssertConfigDialog, {
        global: {
          stubs: {
            NModal: { template: '<div><slot /></div>' }
          }
        }
    })
    const vm = wrapper.vm as any
    
    vm.onExecuteFailure = 'continue'
    vm.reset()
    
    expect(vm.onExecuteFailure).toBe('stop')
  })

  it('loads failure behavior from action in edit mode', async () => {
    const wrapper = shallowMount(AssertConfigDialog, {
        global: {
          stubs: {
            NModal: { template: '<div><slot /></div>' }
          }
        }
    })
    const vm = wrapper.vm as any

    const action = {
        type: 'assert',
        id: '1',
        params: { conditions: [], operator: 'and' },
        onExecuteFailure: 'continue',
        onAssertFailure: 'continue'
    }

    vm.edit(action)
    expect(vm.onExecuteFailure).toBe('continue')
    expect(vm.onAssertFailure).toBe('continue')
  })
  
  it('emits confirm with failure config', async () => {
     const wrapper = shallowMount(AssertConfigDialog, {
      global: {
        stubs: {
          NModal: {
            template: '<div><slot /><slot name="action" /></div>'
          }
        }
      }
    })
    const vm = wrapper.vm as any
    vm.show()
    
    // Add a condition to enable confirm button
    vm.addCondition({ type: 'element', selector: { xpath: '//btn' }, expect: 'exists' })
    vm.onAssertFailure = 'continue'

    // Trigger handleConfirm directly
    vm.handleConfirm()
    
    expect(wrapper.emitted('confirm')).toBeTruthy()
    const args = wrapper.emitted('confirm')![0]
    expect(args[1]).toEqual({
        onExecuteFailure: 'stop',
        onAssertFailure: 'continue'
    })
  })
})