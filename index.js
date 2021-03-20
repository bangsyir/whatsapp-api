const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const {body, validationResult} = require('express-validator')
const sockerIO = require('socket.io')
const qrcode = require('qrcode');
const fs = require('fs');
const http = require('http')
const fileUpload = require('express-fileupload')
const axios = require('axios')

const { phoneNumberFormatter } = require('./helpers/formatter')

const app = express()
const server = http.createServer(app)
const io = sockerIO(server)

app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use(fileUpload({
	debug:true
}))

const SESSION_FILE_PATH = './session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
	res.sendFile('index.html', {root: __dirname})
})

const client = new Client({ puppeteer: { 
	args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
	headless: true 
}, session: sessionCfg });

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    } else if(msg.body == 'hai kamu'){
    	msg.reply('hi juga, selamay datang')
    }
});

client.initialize();

// socket.io
io.on('connection', (socket) => {
	socket.emit('message', 'connecting...')
	client.on('qr', (qr) => {
	    console.log('QR RECEIVED', qr);
	    qrcode.toDataURL(qr, (err, url) => {
	    	socket.emit('qr', url)
			socket.emit('message', 'Qrcode received, please scan')

	    })
	});
	client.on('ready', () => {
		socket.emit('ready', 'Client is ready!')
		socket.emit('message', 'Client is ready!')
	});
	client.on('authenticated', (session) => {
		socket.emit('authenticated', 'Client is authenticated!')
		socket.emit('message', 'Client is authenticated!')
	    console.log('AUTHENTICATED', session);
	    sessionCfg=session;
	    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
	        if (err) {
	            console.error(err);
	        }
	    });
	});
})

const checkRegiteredNumber = async (number) => {
	const isRegistered = await client.isRegisteredUser(number)
	return isRegistered 
}

app.post('/send-message', [
	body('number').notEmpty(),
	body('message').notEmpty()
], async (req, res) => {
	const errors = validationResult(req).formatWith(({msg}) => {
		return msg
	})
	if(!errors.isEmpty()) {
		return res.status(422).json({
			status: false,
			message: errors.mapped()
		})
	}
	const number = phoneNumberFormatter(req.body.number)
	const message = req.body.message 

	const isRegisteredNumber = await checkRegiteredNumber(number)
	if(!isRegisteredNumber) {
		return res.status(422).json({
			status: false,
			message: 'This number is no registered'
		})
	}
	client.sendMessage(number, message)
	.then(response => {
		res.status(200).json({
			status: true, 
			response: response
		})
	})
	.catch(err => {
		res.status(500).json({
			status: false,
			response: err
		})
	})
})

app.post('/send-media', async (req, res) => {
	const number = phoneNumberFormatter(req.body.number)
	const caption = req.body.caption
	const fileUrl = req.body.file
	// const media = MessageMedia.fromFilePath('./image.jpg') 
	// const file = req.files.file
	// const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name)
	let mimetype
	const attachment = await axios.get(fileUrl, {responseType: 'arraybuffer'})
	.then(response => {
		mimetype = response.headers['content-type']
		return response.data.toString('base64')
	})
	const media = new MessageMedia(mimetype, attachment, 'media')

	const isRegisteredNumber = await checkRegiteredNumber(number)
	if(!isRegisteredNumber) {
		return res.status(422).json({
			status: false,
			message: 'This number is no registered'
		})
	}
	client.sendMessage(number, media, {caption: caption})
	.then(response => {
		res.status(200).json({
			status: true, 
			response: response
		})
	})
	.catch(err => {
		res.status(500).json({
			status: false,
			response: err
		})
	})
})

server.listen(9000, function() {
	console.log('app running on port 9000')
})