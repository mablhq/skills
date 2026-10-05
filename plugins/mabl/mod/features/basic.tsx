import type {Feature} from '../core/feature';
import {field, mablCall, obj, str, withWorkspace} from '../core/util';
import type {CallRecord, EntityUpdate} from '../core/util';

/** Tests and flows created or edited directly. They need no polling and get no tab. */
export const captureBasic = (call: CallRecord): EntityUpdate[] => {
  const parsed = mablCall(call);
  if (parsed?.source !== 'mcp') {
    return [];
  }
  const data = obj(call.structured);
  const {args, text} = call;
  switch (parsed.name) {
    case 'create_mabl_test':
    case 'edit_mabl_test_steps':
    case 'edit_mabl_test_metadata': {
      const testId = str(args.testId) ?? field(data, text, 'testId');
      const isDone =
        data.created === true ||
        data.saved === true ||
        parsed.name === 'edit_mabl_test_metadata';

      return testId && isDone
        ? [
            withWorkspace({
              kind: 'test',
              id: testId,
              name: str(data.name) ?? str(args.name),
              branch: str(data.branch),
              workspaceId: str(args.workspaceId),
              status: parsed.name === 'create_mabl_test' ? 'created' : 'edited',
            }),
          ]
        : [];
    }
    case 'create_mabl_flow':
    case 'edit_mabl_flow_steps': {
      const flowId = str(data.flowId) ?? str(args.flowId);
      const isDone = data.created === true || data.saved === true;

      return flowId && isDone
        ? [
            {
              kind: 'flow',
              id: flowId,
              name: str(args.name),
              branch: str(data.branch),
              workspaceId: str(args.workspaceId),
              status: parsed.name === 'create_mabl_flow' ? 'created' : 'edited',
            },
          ]
        : [];
    }
    default:
      return [];
  }
};

export const basicFeature: Feature = {
  kinds: ['test', 'flow'],
  tabKinds: [],
  capture: captureBasic,
  pollMs: () => undefined,
  isFinished: () => true,
  tabTitle: (entity) => entity.name ?? entity.id,
  render: ({Text}, {entity}) => <Text>{entity.name ?? entity.id}</Text>,
};
