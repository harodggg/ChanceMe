class Block { 
	public index : number; 
	public hash : string; 
	public previousHash : string; 
	public timestramp : number; 
	public data : string; 

	constructor(index: number, hash: string, previousHash: string, timestramp: number, data: string){ 
		this.index = index; 
		this.hash = hash; 
		this.previousHash = previousHash; 
		this.timestramp = timestramp;
		this.data = data;
	}

}


export = Block ;
