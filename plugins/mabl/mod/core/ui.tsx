import type {RenderElement} from 'claude-code';

import type {Actions, Els} from './feature';

/** A button that opens a mabl page, or nothing when there is no URL. */
export const openButton = (
  {Button}: Pick<Els, 'Button'>,
  actions: Actions,
  key: string,
  href: string | undefined,
  label = 'Open',
): RenderElement | undefined =>
  href ? (
    <Button key={key} label={label} onPress={() => actions.openUrl(href)} />
  ) : undefined;
