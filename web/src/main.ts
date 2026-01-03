import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import router from './router'
import App from './App.vue'
import './style.css'
import './styles/tokens.css'

// Import JetBrains Mono font for offline use
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(naive)

app.mount('#app')
