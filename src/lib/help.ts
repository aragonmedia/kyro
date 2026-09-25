/**
 * Help content.
 *
 * Same arrangement as the legal pages: the markdown in docs/help is the one
 * source, imported raw and rendered at runtime, so the page cannot drift from
 * the file anyone edits.
 */

import helpRaw from '../../docs/help/HELP.md?raw';

export const HELP_MD = helpRaw;
