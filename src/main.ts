import './styles.css'
import { App } from './app/App'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Application root was not found')
}

const app = new App(root)
app.start()
