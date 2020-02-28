const sdk = require('aws-sdk');

const ddbOptions = {
    apiVersion: '2012-08-10'
};

if (process.env.AWS_SAM_LOCAL) {
    ddbOptions.endpoint = new sdk.Endpoint('http://dynamodb:8000')
}

if (process.env.E2E_TEST) {
    ddbOptions.endpoint = new sdk.Endpoint('http://localhost:8000')
}

const client = new sdk.DynamoDB(ddbOptions);
const tableName = process.env.TABLE;

exports.handler = async event => {
    try {
        const book = JSON.parse(event.Records[0].body);
        const {isbn, title, year, author, review} = book;

        const params = {
            TableName: tableName,
            Item: { 
                isbn: {S: isbn},
                title: {S: title},
                year: {S: year},
                author: {S: author},
                reviews: {N: review.toString()}
            }
        };
        await client.putItem(params).promise();
        
        return;
    } catch (error) {
        console.log(error);
        throw error;
    }
   
};
