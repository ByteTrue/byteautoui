import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { reactive } from 'vue'
import PlaybackTab from '@/components/panels/PlaybackTab.vue'
import { createMockPlayer, mockT, mockCommonT } from './ui-test-utils'
import { NSwitch, NSelect, NTree } from 'naive-ui'
import type { RecordingMetadata } from '@/api/recording'

describe('PlaybackTab.vue', () => {
  let player: ReturnType<typeof createMockPlayer>
  
  const mockRecordings: RecordingMetadata[] = [
    {
      group: 'default',
      name: 'test-recording',
      size: 1024,
      modified_at: Date.now(),
      platform: 'android'
    }
  ]

  beforeEach(() => {
    player = createMockPlayer()
    // Setup initial recording state
    player.recording.value.config = {
      captureScreenshots: true,
      screenshotQuality: 0.8,
      recordElementDetails: true,
      globalFailureControl: {
        enabled: false,
        onExecuteFailure: 'stop',
        onAssertFailure: 'stop'
      }
    } as any
  })

  it('renders global failure control switch', async () => {
    const wrapper = shallowMount(PlaybackTab, {
      props: {
        player,
        recordings: mockRecordings,
        loading: false,
        isRecordingActive: false,
        t: mockT,
        commonT: mockCommonT
      },
      global: {
        components: { NSwitch, NSelect },
        stubs: {
          NIcon: true,
          NTree: true,
          NEmpty: true,
          NAlert: true,
          NButton: true,
          NTag: true,
          NSpace: true,
          draggable: true
        }
      }
    })

    expect(wrapper.text()).toContain(mockT.failureControl.title)
    expect(wrapper.findComponent(NSwitch).exists()).toBe(true)
  })

  it('toggles global failure control', async () => {
    const wrapper = shallowMount(PlaybackTab, {
      props: {
        player,
        recordings: mockRecordings,
        loading: false,
        isRecordingActive: false,
        t: mockT,
        commonT: mockCommonT
      },
      global: {
        components: { NSwitch, NSelect },
        stubs: { NIcon: true, NTree: true, NEmpty: true, NAlert: true, NButton: true, NTag: true, NSpace: true }
      }
    })

    const switchComp = wrapper.findComponent(NSwitch)
    
    // Simulate updating the value directly as we can't easily trigger the complex event chain in shallowMount
    await switchComp.vm.$emit('update:value', true)
    
    expect(player.recording.value.config.globalFailureControl!.enabled).toBe(true)
    
    // Re-render to show options
    await wrapper.vm.$nextTick()
    
    expect(wrapper.findAllComponents(NSelect).length).toBe(2) // Execute and Assert selectors
  })

  it('updates failure behavior when select changes', async () => {
    // Enable global control first
    player.recording.value.config.globalFailureControl!.enabled = true
    
    const wrapper = shallowMount(PlaybackTab, {
      props: {
        player,
        recordings: mockRecordings,
        loading: false,
        isRecordingActive: false,
        t: mockT,
        commonT: mockCommonT
      },
      global: {
        components: { NSwitch, NSelect },
        stubs: { NIcon: true, NTree: true, NEmpty: true, NAlert: true, NButton: true, NTag: true, NSpace: true }
      }
    })

    const selects = wrapper.findAllComponents(NSelect)
    expect(selects.length).toBe(2)
    
    // Update Execute Failure behavior
    await selects[0].vm.$emit('update:value', 'continue')
    expect(player.recording.value.config.globalFailureControl!.onExecuteFailure).toBe('continue')

    // Update Assert Failure behavior
    await selects[1].vm.$emit('update:value', 'continue')
    expect(player.recording.value.config.globalFailureControl!.onAssertFailure).toBe('continue')
  })

  it('renders recording tree nodes correctly (coverage)', async () => {
    const wrapper = shallowMount(PlaybackTab, {
      props: {
        player,
        recordings: mockRecordings,
        loading: false,
        isRecordingActive: false,
        t: mockT,
        commonT: mockCommonT
      },
      global: {
        components: { NSwitch, NSelect, NTree },
        stubs: { 
          NIcon: true, 
          // Provide a simple stub to ensure it exists and we can get props
          NTree: {
            template: '<div><slot /></div>',
            props: ['renderLabel', 'renderSuffix', 'nodeProps'] 
          },
          NEmpty: true, 
          NAlert: true, 
          NButton: true, 
          NTag: true, 
          NSpace: true 
        }
      }
    })

    const tree = wrapper.findComponent(NTree)
    expect(tree.exists()).toBe(true)

    // Access the render props passed to NTree
    const renderLabel = tree.props('renderLabel')
    const renderSuffix = tree.props('renderSuffix')
    const nodeProps = tree.props('nodeProps')

    expect(renderLabel).toBeDefined()
    expect(renderSuffix).toBeDefined()
    expect(nodeProps).toBeDefined()

    // Test renderLabel for Group
    const groupOption = { isGroup: true, label: 'default', children: [] }
    const groupVNode = renderLabel({ option: groupOption })
    // We can't easily assert the VNode content without mounting it, but executing it covers lines
    expect(groupVNode).toBeDefined()

    // Test renderLabel for Recording
    const recordingOption = { 
      isGroup: false, 
      label: 'test-rec', 
      recording: mockRecordings[0] 
    }
    const recVNode = renderLabel({ option: recordingOption })
    expect(recVNode).toBeDefined()

    // Test renderSuffix for Recording
    const suffixVNode = renderSuffix({ option: recordingOption })
    expect(suffixVNode).toBeDefined()

    // Test renderSuffix for Group (should be null)
    const groupSuffix = renderSuffix({ option: groupOption })
    expect(groupSuffix).toBeNull()

    // Test nodeProps
    const props = nodeProps({ option: recordingOption })
    expect(props.onClick).toBeDefined()
    // Trigger click
    props.onClick()
    expect(wrapper.emitted('load-recording')).toBeTruthy()
    expect(wrapper.emitted('load-recording')![0]).toEqual(['default', 'test-recording'])
  })

  it('renders step classes correctly during playback', async () => {
    // Setup player state
    player.recording.value.actions = [
      { 
        id: 'step-1', 
        type: 'tap', 
        timestamp: 0, 
        relativeTime: 0, 
        waitAfter: 0, 
        onExecuteFailure: 'stop', 
        onAssertFailure: 'stop', 
        coords: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
        params: { x: 0, y: 0 } 
      } as any,
      { 
        id: 'step-2', 
        type: 'assert', 
        timestamp: 0, 
        relativeTime: 0, 
        waitAfter: 0, 
        onExecuteFailure: 'stop', 
        onAssertFailure: 'stop', 
        params: { description: 'test' } 
      } as any
    ]
    
    // Mock step results using reactive map to trigger updates
    const results = reactive(new Map())
    results.set('step-1', { status: 'success' })
    results.set('step-2', { status: 'running' })
    
    player.getStepResult = (id: string) => results.get(id)
    player.isPlaying.value = true
    player.currentIndex.value = 1

    const wrapper = shallowMount(PlaybackTab, {
      props: {
        player,
        recordings: mockRecordings,
        loading: false,
        isRecordingActive: false,
        t: mockT,
        commonT: mockCommonT
      },
      global: {
        components: { NSwitch, NSelect, NTree },
        stubs: { 
          NIcon: true, 
          NTree: true, 
          NEmpty: true, 
          NAlert: true, 
          NButton: true, 
          NTag: {
            template: '<div class="n-tag"><slot /></div>'
          },
          NSpace: true 
        }
      }
    })

    // Find step items
    const steps = wrapper.findAll('.step-item')
    expect(steps.length).toBe(2)
    
    // Check classes
    expect(steps[0].classes()).toContain('success')
    expect(steps[1].classes()).toContain('running')
    expect(steps[1].classes()).toContain('active')
    
    // Check assert tag
    const assertTag = wrapper.find('.assert-result-tag')
    expect(assertTag.exists()).toBe(false) // step-2 is running, so no result tag yet
    
    // Update step-2 to failed
    results.set('step-2', { status: 'failed' })
    await wrapper.vm.$nextTick()
    expect(steps[1].classes()).toContain('failed')
    
    // Check assert tag for failed
    // Need to re-find because DOM updates
    // Actually the v-if="getAssertResultTag(action)" should now be true
    // Wait, getAssertResultTag logic: if status is pending or running return null.
    // Now it is failed, so it should return object.
    
    // Force update might be needed if reactivity is tricky with mocked map getter
    await wrapper.setProps({ player: { ...player } }) 
    
    // Find the tag specifically by class
    const assertTagFailed = wrapper.findComponent('.assert-result-tag')
    expect(assertTagFailed.exists()).toBe(true)
    expect(assertTagFailed.props('type')).toBe('error')
  })
})
