const chai = require('chai');
const expect = chai.expect;

const sdk = require('aws-sdk');

const ddbOptions = {
  apiVersion: '2012-08-10',
  endpoint: new sdk.Endpoint('http://localhost:8000')
};
const ddbClient = new sdk.DynamoDB(ddbOptions);

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
        Key: {isbn: {S: bookToPut.isbn}},
        ConsistentRead: true
      };

      const {Item} = await ddbClient.getItem(ddbParams).promise();
      console.log(Item);
      expect(Item).not.to.be.undefined;
    });

})