import Block = require('./block');
const CryptoJS = require("crypto-js");
const express = require('express');

const genesisBlock: Block = new Block(
    0,'5bedd317328c9ed79ecd3aecee74d37f97813cb4ce61ef3402eb388fb369fa86',null, 1111111,'my genesis block');
const blockchain : Block[] = [genesisBlock];
const sockets: WebSocket[];
const calculateHash = (index: number, previousHash: string, timestrap: number, data: string): string =>
        CryptoJS.SHA256(index + previousHash + timestrap + data).toString();
const calculateHashForBlock = (block : Block) => calculateHash(block.index, block.previousHash, block.timestramp , block.data);

const getLatestBlock = () =>  blockchain[blockchain.length -1];

const getBlockchain = () => blockchain;

const generateNextBlock = (dataBlock : string) => {
	const previousBlock : Block = getLatestBlock();
	const nextIndex : number = previousBlock.index + 1; 
	const nextTimestrap : number = new Date().getTime() / 1000;
	const nextHash : string = calculateHash(nextIndex, previousBlock.hash,nextTimestrap,dataBlock);
	const newBlock = new Block(nextIndex,nextHash,previousBlock.hash,nextTimestrap,dataBlock);
	return newBlock;
}

const isValidNewBlock = (newBlock: Block, previousBlock: Block) => {
	if (previousBlock.index + 1 !== newBlock.index) {
		console.log('invalid index');
		return false;
	} else if (previousBlock.hash !== newBlock.previousHash) {
		console.log('invalid previoushash');
		return false;
	} else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
		console.log(typeof (newBlock.hash) + " " + typeof (calculateHashForBlock(newBlock)));
		console.log('validHash:' + calculateHashForBlock(newBlock) + '  ' + newBlock.hash);
	}
}

const isValidBlockStructure = (block : Block) : boolean => {
	return typeof block.index === "number"
		&& typeof block.previousHash === 'string'
		&& typeof block.hash === 'string'
		&& typeof block.timestramp === 'number'
		&& typeof block.data === 'string';
};

const isValidChain = (BlockChainToValidate : Block[]) =>{
	const isValidGensis = (block :Block) : boolean => {
		return 	JSON.stringify(block) === JSON.stringify(genesisBlock)
	}
	if(!isValidGensis(BlockChainToValidate[0])){
		return false;
	}
	for(let i = 1; i < BlockChainToValidate.length; i++){
		if(!isValidNewBlock(BlockChainToValidate[i],BlockChainToValidate[i-1])){
			return false;
		}
	}
};

const initHttpServer = (myHttpPort: number) => {
	const app = express();
	app.use(bodyParse.json());

	app.get('/blocks',(req  ,res) => {
		res.send(getBlockchain());
	});
	app.post('/mineBlock',(req,res) => {
		const  newBlock : Block = generateNextBlock(req.body.data);
		res.send(newBlock);
	});
	app.get('/peers',(req,res) => {
		res.send(getSockets().map((s: any) => s._socket.remoteAddress + ':' + s._socket.remotePort());
	});
	app.post('/addPeer', (req, res) => {
		connectToPeers(req.body.peer);
		res.send();
	});
	app.listen(myHttpPort, () => {
		console.log('Listening http on port: ' + myHttpPort);
	});
};

initHttpServer(3001)
