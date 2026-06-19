export interface DesensitizeResult {
  text: string;
  maskedItems: string[];
}

export function desensitizeText(text: string): DesensitizeResult {
  const maskedItems: string[] = [];
  let result = text;

  const idCardRegex = /\b[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g;
  result = result.replace(idCardRegex, (match) => {
    maskedItems.push(`身份证号: ${match}`);
    return match.slice(0, 4) + "**********" + match.slice(-4);
  });

  const phoneRegex = /\b(?:\+?86[- ]?)?1[3-9]\d{9}\b/g;
  result = result.replace(phoneRegex, (match) => {
    maskedItems.push(`手机号: ${match}`);
    const digits = match.replace(/\D/g, "");
    if (digits.length === 11) {
      return digits.slice(0, 3) + "****" + digits.slice(-4);
    }
    return match.slice(0, Math.ceil(match.length / 3)) + "****" + match.slice(-Math.floor(match.length / 3));
  });

  const namePatterns = [
    /(?:来访者|来访|个案|患者|求助者|访客)[：:\s]*([\u4e00-\u9fa5]{2,4})/g,
    /(?:姓名|名字|真名|本名)[：:\s]*([\u4e00-\u9fa5]{2,4})/g,
    /(?:丈夫|妻子|老公|老婆|爸爸|妈妈|父亲|母亲|哥哥|姐姐|弟弟|妹妹|儿子|女儿|朋友|同事|领导|老师|学生)[：:\s]*([\u4e00-\u9fa5]{2,4})/g,
  ];

  namePatterns.forEach((pattern) => {
    result = result.replace(pattern, (fullMatch, name) => {
      if (name && name.length >= 2) {
        maskedItems.push(`姓名: ${name}`);
        const prefix = fullMatch.replace(name, "");
        if (name.length === 2) {
          return prefix + name[0] + "*";
        }
        return prefix + name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
      }
      return fullMatch;
    });
  });

  const standaloneNameRegex = /(?<![\u4e00-\u9fa5])([\u4e00-\u9fa5]{2,3})(?![\u4e00-\u9fa5])/g;
  const contextWords = ["的", "和", "与", "跟", "对", "向", "让", "叫", "是", "说", "找"];
  result = result.replace(standaloneNameRegex, (match) => {
    const index = result.indexOf(match);
    const isLikelyName = 
      (index > 0 && contextWords.includes(result[index - 1])) ||
      (index + match.length < result.length && contextWords.includes(result[index + match.length]));
    
    if (isLikelyName && !maskedItems.some(item => item.includes(match))) {
      maskedItems.push(`可能姓名: ${match}`);
      if (match.length === 2) {
        return match[0] + "*";
      }
      return match[0] + "*" + match.slice(-1);
    }
    return match;
  });

  return {
    text: result,
    maskedItems: Array.from(new Set(maskedItems)),
  };
}

export function desensitizeAllFields<T extends Record<string, unknown>>(
  data: T,
  fields: (keyof T)[]
): { data: T; maskedItems: string[] } {
  const allMaskedItems: string[] = [];
  const result = { ...data };

  fields.forEach((field) => {
    const value = result[field];
    if (typeof value === "string") {
      const { text, maskedItems } = desensitizeText(value);
      (result as Record<string, unknown>)[field as string] = text;
      allMaskedItems.push(...maskedItems);
    }
  });

  return {
    data: result,
    maskedItems: Array.from(new Set(allMaskedItems)),
  };
}
