// Components
import App from './App.vue';
import MdiIcon from './components/MdiIcon.vue';
import XDialog from './components/XDialog.vue';

import styles from './styles.css?inline';

// Composables
import { createApp } from 'vue';

if (!document.querySelector('#inventory-wiki')) {
    const root = document.createElement('div');
    root.id = 'inventory-wiki';

    document.querySelector('header').insertAdjacentElement('afterend', root);

    const app = createApp(App);
    app.component('MdiIcon', MdiIcon);
    app.component('XDialog', XDialog);
    app.mount('#inventory-wiki');

    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);
}