(function () {
  const ALLOWED_MARKDOWN_TAGS = new Set([
    "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "li", "ol", "p", "pre", "s", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
  ]);
  const DANGEROUS_MARKDOWN_TAGS = new Set(["embed", "iframe", "object", "script", "style"]);
  const MATH_TOKEN_PATTERN = /(AISATTUTORMATH\d+TOKEN)/g;

  function isSafeLinkUrl(value) {
    try {
      const url = new URL(value, "https://extension.invalid");
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
    } catch (error) {
      return false;
    }
  }

  function sanitizeMarkdownHtml(template) {
    template.content.querySelectorAll("*").forEach((element) => {
      const tagName = element.tagName.toLowerCase();
      if (!ALLOWED_MARKDOWN_TAGS.has(tagName)) {
        if (DANGEROUS_MARKDOWN_TAGS.has(tagName)) element.remove();
        else element.replaceWith(...element.childNodes);
        return;
      }
      for (const attribute of [...element.attributes]) {
        if (tagName === "a" && attribute.name === "href" && isSafeLinkUrl(attribute.value)) continue;
        element.removeAttribute(attribute.name);
      }
      if (tagName === "a" && element.hasAttribute("href")) {
        element.target = "_blank";
        element.rel = "noopener noreferrer";
      }
    });
  }

  function protectMath(markdown) {
    const expressions = [];
    const addExpression = (expression, displayMode) => {
      const token = `AISATTUTORMATH${expressions.length}TOKEN`;
      expressions.push({ expression: expression.trim(), displayMode, token });
      return token;
    };

    const protectedMarkdown = markdown
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression) => addExpression(expression, true))
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, expression) => addExpression(expression, true))
      .replace(
        /(^|\n)[ \t]*\[\s*\n([\s\S]*?)\n[ \t]*\](?=\n|$)/g,
        (_, prefix, expression) => `${prefix}${addExpression(expression, true)}`
      )
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, expression) => addExpression(expression, false))
      .replace(/(?<!\\)\$([^\n$]+?)\$/g, (_, expression) => addExpression(expression, false));

    return { expressions, markdown: protectedMarkdown };
  }

  function createMathElement(expression, displayMode) {
    const math = document.createElement("span");
    math.className = displayMode ? "math-display" : "math-inline";
    globalThis.katex.render(expression, math, {
      displayMode,
      strict: "ignore",
      throwOnError: false,
      trust: false,
    });
    return math;
  }

  function renderMath(container, expressions) {
    if (!expressions.length || typeof globalThis.katex?.render !== "function") return;
    const expressionsByToken = new Map(expressions.map((expression) => [expression.token, expression]));
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest("code, pre, a")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      if (MATH_TOKEN_PATTERN.test(textNode.nodeValue)) textNodes.push(textNode);
      MATH_TOKEN_PATTERN.lastIndex = 0;
    }
    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.nodeValue.split(MATH_TOKEN_PATTERN).forEach((part) => {
        const expression = expressionsByToken.get(part);
        fragment.append(expression ? createMathElement(expression.expression, expression.displayMode) : part);
      });
      node.replaceWith(fragment);
    });
  }

  function setMessageContent(body, role, text) {
    if (role !== "assistant" || typeof globalThis.marked?.parse !== "function") {
      body.textContent = text;
      return;
    }
    const { expressions, markdown } = protectMath(text);
    const template = document.createElement("template");
    template.innerHTML = globalThis.marked.parse(markdown, { breaks: true, gfm: true });
    sanitizeMarkdownHtml(template);
    body.replaceChildren(template.content);
    renderMath(body, expressions);
  }

  function addMessage(container, role, text, extraClass = "") {
    const message = document.createElement("article");
    message.className = ["message", role, extraClass].filter(Boolean).join(" ");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = role === "student" ? "You" : "Tutor";
    const body = document.createElement(role === "assistant" ? "div" : "p");
    body.className = "message-body";
    setMessageContent(body, role, text);
    message.append(label, body);
    container.append(message);
    return message;
  }

  function updateMessage(message, text, extraClass = "") {
    const body = message.querySelector(".message-body");
    if (body) setMessageContent(body, "assistant", text);
    message.className = ["message", "assistant", extraClass].filter(Boolean).join(" ");
  }

  globalThis.aiSatTutorRendering = { protectMath, createMathElement, setMessageContent, addMessage, updateMessage };
})();
