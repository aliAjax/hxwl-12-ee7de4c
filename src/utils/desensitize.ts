export interface DesensitizeResult {
  text: string;
  maskedItems: MaskedItemInfo[];
}

export interface MaskedItemInfo {
  type: "idCard" | "phone" | "name" | "possibleName";
  masked: string;
}

function maskIdCard(idCard: string): string {
  if (idCard.length <= 8) return "****";
  return idCard.slice(0, 4) + "**********" + idCard.slice(-4);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 11) {
    const last11 = digits.slice(-11);
    return last11.slice(0, 3) + "****" + last11.slice(-4);
  }
  if (digits.length >= 7) {
    return digits.slice(0, 3) + "****" + digits.slice(-4);
  }
  if (phone.length <= 6) return "****";
  return phone.slice(0, Math.ceil(phone.length / 3)) + "****" + phone.slice(-Math.floor(phone.length / 3));
}

function maskName(name: string): string {
  if (name.length === 1) return "*";
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}

const SAFE_WORDS = new Set([
  "今天", "昨天", "明天", "最近", "一直", "总是", "经常", "有时候", "有时",
  "觉得", "感觉", "感到", "因为", "所以", "但是", "而且", "还有", "就是",
  "自己", "我们", "你们", "他们", "她们", "它们", "咱们",
  "这个", "那个", "这些", "那些", "这样", "那样",
  "什么", "怎么", "为什么", "哪里", "什么时候", "怎么样",
  "可以", "可能", "应该", "需要", "能够",
  "然后", "后来", "之前", "之后", "现在", "以后", "以前",
  "特别", "非常", "比较", "有点", "十分", "相当",
  "工作", "生活", "学习", "家庭", "感情", "情绪", "身体", "心理",
  "问题", "情况", "事情", "东西", "方面", "地方",
  "焦虑", "抑郁", "紧张", "害怕", "担心", "难过", "开心", "痛苦",
  "睡眠", "吃饭", "休息", "睡觉", "运动", "锻炼",
  "咨询", "治疗", "会谈", "辅导", "帮助", "支持",
  "压力", "关系", "沟通", "冲突", "矛盾",
  "孩子", "父母", "家人", "朋友", "同事",
  "知道", "明白", "理解", "记得", "忘记",
  "希望", "打算", "准备", "决定",
  "如果", "虽然", "不过", "可是", "于是", "因此",
  "一个", "一些", "一下", "一样", "一起",
  "已经", "正在", "还是", "只是", "只有", "甚至",
  "来访者", "来访", "个案", "患者", "求助者", "访客",
  "姓名", "名字", "真名", "本名", "称呼",
  "丈夫", "妻子", "老公", "老婆",
  "爸爸", "妈妈", "父亲", "母亲", "爸妈",
  "哥哥", "姐姐", "弟弟", "妹妹",
  "儿子", "女儿",
  "朋友", "闺蜜", "男友", "女友", "对象", "伴侣",
  "同事", "领导", "上司", "下属",
  "老师", "学生", "导师",
  "医生", "护士", "咨询师", "治疗师",
  "邻居", "房东", "室友",
  "女士", "先生", "同学", "经理", "总监", "老板", "主管",
  "总裁", "教授", "博士", "工程师", "设计师",
  "联系电话", "电话", "手机", "备用号",
  "身份证号", "身份证",
  "叫", "是", "为", "叫",
]);

const NAME_PREFIXES = [
  "来访者", "来访", "个案", "患者", "求助者", "访客",
  "姓名", "名字", "真名", "本名", "称呼",
  "丈夫", "妻子", "老公", "老婆",
  "爸爸", "妈妈", "父亲", "母亲",
  "哥哥", "姐姐", "弟弟", "妹妹",
  "儿子", "女儿",
  "朋友", "闺蜜", "男友", "女友", "对象", "伴侣",
  "同事", "领导", "上司", "下属",
  "老师", "学生", "导师",
  "医生", "护士", "咨询师", "治疗师",
  "邻居", "房东", "室友",
  "我爸", "我妈", "我哥", "我姐", "我弟", "我妹",
  "我老公", "我老婆", "我丈夫", "我妻子",
  "我儿子", "我女儿", "我孩子",
  "我朋友", "我同事", "我领导", "我老师", "我学生",
  "他爸", "他妈", "他哥", "他姐", "他弟", "他妹",
  "他老公", "他老婆", "他儿子", "他女儿",
  "你爸", "你妈", "你哥", "你姐",
].sort((a, b) => b.length - a.length);

const NAME_SEPARATORS = [
  "姓名", "名字", "叫", "是", "为", "称",
];

const NAME_SUFFIXES = [
  "同学", "女士", "先生", "老师", "医生",
  "经理", "总监", "老板", "主管", "总裁",
  "教授", "博士", "工程师", "设计师",
].sort((a, b) => b.length - a.length);

const CONTEXT_VERBS = [
  "说", "告诉", "表示", "觉得", "认为", "想", "问", "回答",
  "提到", "指出", "强调", "建议", "知道",
].sort((a, b) => b.length - a.length);

const NAME_FOLLOWERS = [
  "的", "和", "与", "跟", "对", "向", "让", "叫", "是", "说", "找",
  "知道", "联系", "沟通", "支持", "帮助",
].sort((a, b) => b.length - a.length);

const SURNAME_SET = new Set([
  "赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈", "褚", "卫",
  "蒋", "沈", "韩", "杨", "朱", "秦", "尤", "许", "何", "吕", "施", "张",
  "孔", "曹", "严", "华", "金", "魏", "陶", "姜", "戚", "谢", "邹", "喻",
  "柏", "水", "窦", "章", "云", "苏", "潘", "葛", "奚", "范", "彭", "郎",
  "鲁", "韦", "昌", "马", "苗", "凤", "花", "方", "俞", "任", "袁", "柳",
  "唐", "罗", "薛", "伍", "余", "米", "贝", "明", "臧", "计", "伏", "成",
  "宋", "茅", "庞", "熊", "纪", "舒", "屈", "项", "祝", "董", "梁", "杜",
  "高", "林", "徐", "邱", "骆", "夏", "蔡", "田", "樊", "胡", "凌",
  "霍", "虞", "万", "支", "柯", "管", "卢", "莫", "经", "房", "裘",
  "龚", "程", "嵇", "邢", "滑", "裴", "陆", "荣", "翁", "荀", "羊",
  "惠", "甄", "曲", "家", "封", "芮", "羿", "储", "靳", "汲", "邴", "糜",
  "松", "井", "段", "富", "巫", "乌", "焦", "巴", "弓", "牧", "隗", "山",
  "谷", "车", "侯", "宓", "蓬", "全", "郗", "班", "仰", "秋", "仲", "伊",
  "宁", "仇", "栾", "暴", "甘", "厉", "戎", "祖", "武", "刘", "詹",
  "叶", "幸", "司", "韶", "郜", "黎", "蓟", "薄", "印", "宿", "白", "怀",
  "蒲", "邰", "从", "鄂", "索", "咸", "籍", "赖", "卓", "蔺", "屠", "蒙",
  "乔", "阴", "胥", "闻", "莘", "党", "翟", "谭", "贡", "劳", "逄",
  "姬", "申", "扶", "堵", "冉", "宰", "郦", "雍", "璩", "桑", "桂",
  "黄",
]);

function isChineseNameCandidate(word: string): boolean {
  if (word.length < 2 || word.length > 4) return false;
  if (SAFE_WORDS.has(word)) return false;
  if (!SURNAME_SET.has(word[0])) return false;
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    if (!/[\u4e00-\u9fa5]/.test(char)) return false;
  }
  return true;
}

function findChineseNameAtStart(text: string): string | null {
  for (let len = 3; len >= 2; len--) {
    if (text.length >= len) {
      const candidate = text.slice(0, len);
      if (isChineseNameCandidate(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function desensitizeText(text: string): DesensitizeResult {
  const maskedItems: MaskedItemInfo[] = [];
  const outputParts: string[] = [];
  let i = 0;

  const addMaskedItem = (type: MaskedItemInfo["type"], masked: string) => {
    const exists = maskedItems.some(
      (m) => m.type === type && m.masked === masked
    );
    if (!exists) {
      maskedItems.push({ type, masked });
    }
  };

  while (i < text.length) {
    const idCardRegex = /[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/y;
    idCardRegex.lastIndex = i;
    const idCardMatch = idCardRegex.exec(text);
    if (idCardMatch && idCardMatch.index === i) {
      const masked = maskIdCard(idCardMatch[0]);
      addMaskedItem("idCard", masked);
      outputParts.push(masked);
      i += idCardMatch[0].length;
      continue;
    }

    const phoneRegex = /\+?\s*86[-\s]?1[3-9]\d{9}|1[3-9]\d{9}/y;
    phoneRegex.lastIndex = i;
    const phoneMatch = phoneRegex.exec(text);
    if (phoneMatch && phoneMatch.index === i) {
      const masked = maskPhone(phoneMatch[0]);
      addMaskedItem("phone", masked);
      outputParts.push(masked);
      i += phoneMatch[0].length;
      continue;
    }

    let prefixHandled = false;
    for (const prefix of NAME_PREFIXES) {
      if (text.startsWith(prefix, i)) {
        let pos = i + prefix.length;
        let sepLen = 0;
        while (pos < text.length && /[：:\s，,。.！!？?；;]/.test(text[pos])) {
          sepLen++;
          pos++;
        }
        let sep2Len = 0;
        for (const sep of NAME_SEPARATORS) {
          if (text.startsWith(sep, pos)) {
            sep2Len = sep.length;
            pos += sep.length;
            while (pos < text.length && /[：:\s，,。.！!？?；;]/.test(text[pos])) {
              sepLen++;
              pos++;
            }
            break;
          }
        }

        const nameCandidate = findChineseNameAtStart(text.slice(pos));
        if (nameCandidate) {
          const masked = maskName(nameCandidate);
          addMaskedItem("name", masked);
          outputParts.push(
            prefix +
            text.slice(i + prefix.length, i + prefix.length + sepLen + sep2Len) +
            masked
          );
          i = pos + nameCandidate.length;
          prefixHandled = true;
          break;
        }
      }
    }
    if (prefixHandled) continue;

    const char = text[i];
    if (/[\u4e00-\u9fa5]/.test(char)) {
      const chineseRunMatch = text.slice(i).match(/^[\u4e00-\u9fa5]+/);
      if (chineseRunMatch) {
        const run = chineseRunMatch[0];
        let runProcessed = 0;

        while (runProcessed < run.length) {
          let nameFound = false;

          for (const suffix of NAME_SUFFIXES) {
            for (let nameLen = 2; nameLen <= 3; nameLen++) {
              const candidateEnd = runProcessed + nameLen;
              if (candidateEnd + suffix.length > run.length) break;
              if (run.slice(candidateEnd, candidateEnd + suffix.length) === suffix) {
                const candidate = run.slice(runProcessed, candidateEnd);
                if (isChineseNameCandidate(candidate)) {
                  const masked = maskName(candidate);
                  addMaskedItem("name", masked);
                  outputParts.push(masked + suffix);
                  runProcessed = candidateEnd + suffix.length;
                  nameFound = true;
                  break;
                }
              }
            }
            if (nameFound) break;
          }
          if (nameFound) continue;

          for (const verb of CONTEXT_VERBS) {
            for (let nameLen = 2; nameLen <= 3; nameLen++) {
              const candidateEnd = runProcessed + nameLen;
              if (candidateEnd + verb.length > run.length) break;
              if (run.slice(candidateEnd, candidateEnd + verb.length) === verb) {
                const candidate = run.slice(runProcessed, candidateEnd);
                if (isChineseNameCandidate(candidate)) {
                  const masked = maskName(candidate);
                  addMaskedItem("possibleName", masked);
                  outputParts.push(masked + verb);
                  runProcessed = candidateEnd + verb.length;
                  nameFound = true;
                  break;
                }
              }
            }
            if (nameFound) break;
          }
          if (nameFound) continue;

          for (const follower of NAME_FOLLOWERS) {
            for (let nameLen = 2; nameLen <= 3; nameLen++) {
              const candidateEnd = runProcessed + nameLen;
              if (candidateEnd + follower.length > run.length) break;
              if (run.slice(candidateEnd, candidateEnd + follower.length) === follower) {
                const candidate = run.slice(runProcessed, candidateEnd);
                if (isChineseNameCandidate(candidate)) {
                  const masked = maskName(candidate);
                  addMaskedItem("possibleName", masked);
                  outputParts.push(masked + follower);
                  runProcessed = candidateEnd + follower.length;
                  nameFound = true;
                  break;
                }
              }
            }
            if (nameFound) break;
          }
          if (nameFound) continue;

          const absPos = i + runProcessed;
          if (absPos > 0 && /[“"‘']/.test(text[absPos - 1])) {
            for (let nameLen = 2; nameLen <= 3; nameLen++) {
              const candidateEnd = runProcessed + nameLen;
              if (candidateEnd > run.length) break;
              const absEnd = absPos + nameLen;
              if (absEnd < text.length && /[”"’']/.test(text[absEnd])) {
                const candidate = run.slice(runProcessed, candidateEnd);
                if (isChineseNameCandidate(candidate)) {
                  const masked = maskName(candidate);
                  addMaskedItem("possibleName", masked);
                  outputParts.push(masked);
                  runProcessed = candidateEnd;
                  nameFound = true;
                  break;
                }
              }
            }
            if (nameFound) continue;
          }

          outputParts.push(run[runProcessed]);
          runProcessed++;
        }
        i += run.length;
        continue;
      }
    }

    outputParts.push(text[i]);
    i++;
  }

  return {
    text: outputParts.join(""),
    maskedItems,
  };
}

export function getMaskedItemLabel(item: MaskedItemInfo): string {
  const labels: Record<MaskedItemInfo["type"], string> = {
    idCard: "身份证号",
    phone: "手机号",
    name: "姓名",
    possibleName: "疑似姓名",
  };
  return `${labels[item.type]}: ${item.masked}`;
}

export function desensitizeAllFields<T extends Record<string, unknown>>(
  data: T,
  fields: (keyof T)[]
): { data: T; maskedItems: MaskedItemInfo[] } {
  const allMaskedItems: MaskedItemInfo[] = [];
  const result = { ...data };

  fields.forEach((field) => {
    const value = result[field];
    if (typeof value === "string") {
      const { text, maskedItems } = desensitizeText(value);
      (result as Record<string, unknown>)[field as string] = text;
      maskedItems.forEach((item) => {
        const exists = allMaskedItems.some(
          (m) => m.type === item.type && m.masked === item.masked
        );
        if (!exists) {
          allMaskedItems.push(item);
        }
      });
    }
  });

  return {
    data: result,
    maskedItems: allMaskedItems,
  };
}
