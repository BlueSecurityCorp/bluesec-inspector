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
