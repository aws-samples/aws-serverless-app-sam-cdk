const chai = require('chai');
const expect = chai.expect;

const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');

const ddbOptions = {
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
};
const ddbClient = new DynamoDBClient(ddbOptions);

const handler = require('../../index').handler;

describe('put book tests', () => {

    it('should insert book in DynamoDB table', async () => {
      // Arrange
      const bookToPut = {isbn: '1', title: 'Best seller', year: '1999', author: 'John Doe', review: 4};
      const event = {Records: [{body: JSON.stringify(bookToPut)}]};

      // Act
      await handler(event);

      // Assert
      const ddbParams = {
        TableName: process.env.TABLE,
        Key: { isbn: { S: bookToPut.isbn } },
        ConsistentRead: true
      };

      const {Item} = await ddbClient.send(new GetItemCommand(ddbParams));
      console.log(Item);
      expect(Item).not.to.be.undefined;
    });

})
