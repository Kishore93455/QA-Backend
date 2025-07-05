require('dotenv').config();
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis({
  host: process.env.IOREDISHOST,
  port: process.env.IOREDISPORT,
  password: process.env.IOREDISPASSWORD,
  maxRetriesPerRequest: null
});

const check = new Queue('check', {connection} )

async function checkData(data) {
    console.log("Queue is Triggered")
    await check.add('check-data', {data})
}

const worker = new Worker('check', async(job) => {
    const data = job
    await new Promise(resolve => setTimeout(resolve, 9000));
    console.log("Queue will work")
}, { connection })


module.exports = {checkData};