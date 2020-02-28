const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const proxyquire = require('proxyquire');

const expect = chai.expect;
chai.use(sinonChai);

describe('put book tests', () => {
  let handler;
  let dynamoDBstub;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    dynamoDBstub = {
      putItem: sandbox.stub().returns({promise: () => Promise.resolve()})
    };

    const mockAws = {DynamoDB: sandbox.stub().returns(dynamoDBstub)};

    handler = proxyquire('../../index', {
      'aws-sdk': mockAws
    }).handler;
  });

  it('should put book', async () => {
    // Arrange    
    const bookToPut = {isbn: '1', title: 'Best seller', year: '1999', author: 'John Doe', review: 4};
    const event = {Records: [{body: JSON.stringify(bookToPut)}]};

    // Act
    await handler(event);

    // Assert
    expect(dynamoDBstub.putItem).to.have.been.calledWith({
      TableName: 'books', 
      Item: {
        author: { S: 'John Doe' }, isbn: { S: '1' }, reviews: { N: '4' }, title: { S: 'Best seller' }, year: { S: '1999' }
      }
    });
  });

  afterEach(() => sandbox.restore());

});