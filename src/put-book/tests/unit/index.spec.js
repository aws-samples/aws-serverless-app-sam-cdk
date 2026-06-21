const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire');

const expect = chai.expect;
chai.use(sinonChai);

describe('put book tests', () => {
  let handler;
  let dynamoDBClientStub;
  let putItemCommandStub;
  let sendStub;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    sendStub = sandbox.stub().resolves();
    dynamoDBClientStub = sandbox.stub().returns({send: sendStub});
    putItemCommandStub = sandbox.stub().callsFake(input => ({input}));

    handler = proxyquire('../../index', {
      '@aws-sdk/client-dynamodb': {
        DynamoDBClient: dynamoDBClientStub,
        PutItemCommand: putItemCommandStub
      }
    }).handler;
  });

  it('should put book', async () => {
    // Arrange    
    const bookToPut = {isbn: '1', title: 'Best seller', year: '1999', author: 'John Doe', review: 4};
    const event = {Records: [{body: JSON.stringify(bookToPut)}]};

    // Act
    await handler(event);

    // Assert
    expect(putItemCommandStub).to.have.been.calledWith({
      TableName: 'books', 
      Item: {
        author: { S: 'John Doe' }, isbn: { S: '1' }, reviews: { N: '4' }, title: { S: 'Best seller' }, year: { S: '1999' }
      }
    });
    expect(sendStub).to.have.been.calledOnce;
  });

  afterEach(() => sandbox.restore());

});
