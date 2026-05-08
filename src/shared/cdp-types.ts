export type RemoteObjectLite = {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  objectId?: string;
  preview?: {
    type: string;
    subtype?: string;
    description?: string;
    overflow?: boolean;
    properties?: Array<{ name: string; type: string; value?: string; subtype?: string }>;
  };
};

export type DomNode = {
  nodeId: number;
  parentId?: number;
  backendNodeId?: number;
  nodeType: number;
  nodeName: string;
  localName?: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: DomNode[];
  attributes?: string[];
  documentURL?: string;
  publicId?: string;
  systemId?: string;
};

export type SessionState = {
  tabId: number;
  attached: boolean;
  inspecting?: boolean;
  url?: string;
  title?: string;
  error?: string;
};

export type CssProperty = {
  name: string;
  value: string;
  important?: boolean;
  disabled?: boolean;
};

export type MatchedStyles = {
  inlineStyle?: { cssProperties?: CssProperty[] };
  attributesStyle?: { cssProperties?: CssProperty[] };
  matchedCSSRules?: Array<{
    rule?: {
      selectorList?: { text?: string };
      origin?: string;
      style?: { cssProperties?: CssProperty[] };
    };
  }>;
  inherited?: unknown[];
};

export type ComputedStyle = Array<{ name: string; value: string }>;

export type CookieSameSite = 'Strict' | 'Lax' | 'None';
export type CookiePriority = 'Low' | 'Medium' | 'High';
export type CookiePartitionKey = {
  topLevelSite?: string;
  hasCrossSiteAncestor?: boolean;
};

export type Cookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number | null;
  size?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  sameSite?: CookieSameSite;
  priority?: CookiePriority;
  sourceScheme?: string;
  sourcePort?: number;
  partitionKey?: CookiePartitionKey;
  partitionKeyOpaque?: boolean;
};

export type CookieInput = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: CookieSameSite;
  expires?: number;
  priority?: CookiePriority;
  partitionKey?: CookiePartitionKey;
};

export type CookieDeleteInput = {
  name: string;
  domain?: string;
  path?: string;
  url?: string;
  partitionKey?: CookiePartitionKey;
};
