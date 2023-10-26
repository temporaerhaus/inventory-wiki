// Components
import QRCode from 'qrcode';
import App from './App.vue';
import MdiIcon from './components/MdiIcon.vue';
import XDialog from './components/XDialog.vue';

import styles from './styles.css?inline';

// Composables
import { createApp } from 'vue';

if (!document.querySelector('#inventory-wiki')) {
    const root = document.createElement('div');
    root.id = 'inventory-wiki';

    document.querySelector('#dokuwiki__content').insertAdjacentElement('beforebegin', root);

    const app = createApp(App);
    app.component('MdiIcon', MdiIcon);
    app.component('XDialog', XDialog);
    app.mount('#inventory-wiki');

    const style = document.createElement('style');
    style.textContent = styles;
    document.head.append(style);
}

const url = `${location.protocol}//${location.host}${location.pathname}`;
document.querySelector('#dokuwiki__footer .doc').insertAdjacentHTML('beforeend', `
    <div class="print">Available at <a href="${location.href}"></a></div>
`);
document.querySelector('#dokuwiki__footer .doc .print a').innerText = url;
QRCode.toDataURL(url, {
    margin: 0,
    type: 'svg',
    mode: 'alphanumeric',
    errorCorrectionLevel: 'L'
}, (err, data) => {
    if (!err) {
        const div = document.createElement('div');
        div.className = 'print';
        const img = document.createElement('img');
        img.src = data;
        div.appendChild(img);

        document.querySelector('#dokuwiki__footer').appendChild(div);

        const abs = document.createElement('img');
        abs.id = 'print-qr';
        abs.src = data;
        document.body.insertAdjacentElement('afterbegin', abs);
    }
});
