///
/// IMPORTS
///

import { DynamoDBRecord } from 'aws-lambda';
import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDB, GenericController, RCError, StreamController } from 'idea-aws';

import { WebSocketConnection, WebSocketConnectionTypes, WebSocketMessage } from '../models/webSocket.model';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const api = new ApiGatewayManagementApi({ endpoint: process.env.WEB_SOCKET_API_URL });

const DDB_CONNECTIONS_TABLE = process.env.DDB_CONNECTIONS_TABLE;
const ddb = new DynamoDB();

const TWO_HOURS_FROM_NOW_IN_SECONDS = Math.floor(Date.now() / 1000) + 60 * 60 * 2;

export const handler = (ev: any, _: any, cb: any): void => {
  if (ev.Records) new WebSocketStreamController(ev, cb).handleRequest();
  else new WebSocketApiController(ev, cb).handleRequest();
};

///
/// API GATEWAY WEBSOCKET
///

class WebSocketApiController extends GenericController {
  async handleRequest(): Promise<void> {
    try {
      const { queryStringParameters: qp, requestContext } = this.event;
      const { routeKey, connectionId, authorizer } = requestContext ?? {};
      switch (routeKey) {
        case '$connect':
          await this.connect(connectionId, qp.type, qp.referenceId, authorizer?.principalId);
          break;
        case '$disconnect':
          await this.disconnect(connectionId);
          break;
        case '$default':
          await this.mockupInfo(connectionId);
          break;
        default:
          throw new RCError('Unsupported action');
      }
      this.callback(null, { statusCode: 200 });
    } catch (error) {
      this.logger.error('Web socket error', error);
      this.callback(null, { statusCode: 400 });
    }
  }
  private async connect(
    connectionId: string,
    type: WebSocketConnectionTypes,
    referenceId: string,
    userId?: string
  ): Promise<void> {
    if (!type || !referenceId) throw new RCError('Missing connection references');
    if (!Object.values(WebSocketConnectionTypes).includes(type)) throw new RCError('Unsupported connection reference');
    const connection = { connectionId, type, referenceId, expiresAt: TWO_HOURS_FROM_NOW_IN_SECONDS, userId };
    this.logger.debug('Opening connection', connection);
    await ddb.put({ TableName: DDB_CONNECTIONS_TABLE, Item: connection });
  }
  private async disconnect(connectionId: string): Promise<void> {
    this.logger.debug('Closing connection', { connectionId });
    await ddb.delete({ TableName: DDB_CONNECTIONS_TABLE, Key: { connectionId } });
  }
  private async mockupInfo(connectionId: string): Promise<void> {
    this.logger.debug('Mockup message', { connectionId });
    const response = 'Active connection '.concat(connectionId);
    await api.postToConnection({ ConnectionId: connectionId, Data: response });
  }
}

///
/// DYNAMODB STREAM
///

class WebSocketStreamController extends StreamController {
  handleRequest(): void {
    Promise.all(this.records.map(record => this.mapDDBStreamRecordsIntoSocketMessages(record)))
      .then((): void => this.done(null))
      .catch((): void => this.done(new RCError('ERROR IN STREAM')));
  }

  private async mapDDBStreamRecordsIntoSocketMessages(record: DynamoDBRecord): Promise<void> {
    const webSocketMessage = this.mapDDBTableStreamIntoSocketMessage(record);
    if (!webSocketMessage) return;

    const connections: WebSocketConnection[] = await ddb.query({
      TableName: DDB_CONNECTIONS_TABLE,
      IndexName: 'type-referenceId-index',
      ExpressionAttributeNames: { '#type': 'type' },
      KeyConditionExpression: '#type = :type AND referenceId = :referenceId',
      ExpressionAttributeValues: { ':type': webSocketMessage.type, ':referenceId': webSocketMessage.referenceId }
    });

    // for each open connection related to the referenceId, send the message (don't wait for the outcome, ignore errors)
    connections.forEach(connection =>
      api
        .postToConnection({ ConnectionId: connection.connectionId, Data: JSON.stringify(webSocketMessage) })
        .catch(err => this.logger.warn('Failed delivery to connection', err, { connection, message: webSocketMessage }))
    );
  }
  private mapDDBTableStreamIntoSocketMessage(record: DynamoDBRecord): WebSocketMessage {
    const action: 'INSERT' | 'MODIFY' | 'REMOVE' = record.eventName;
    const tableName = record.eventSourceARN.split('/')[1];
    const itemKeys = ddb.unmarshall(record.dynamodb.Keys);
    const item =
      action === 'REMOVE' ? ddb.unmarshall(record.dynamodb.OldImage) : ddb.unmarshall(record.dynamodb.NewImage);

    let socketMessage: WebSocketMessage = null;
    if (tableName.endsWith('_messages')) {
      socketMessage = { action, type: WebSocketConnectionTypes.MESSAGES, referenceId: itemKeys.topicId, item };
    }
    return socketMessage;
  }
}
