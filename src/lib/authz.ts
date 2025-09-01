import { isGuest } from './guest';
import { isDemo } from './demo';

export const isReadOnlyVisitor = () => isGuest() || isDemo();