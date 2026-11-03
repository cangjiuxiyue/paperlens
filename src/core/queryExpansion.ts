/**
 * 中文查询改写（跨语言检索的最小可用方案）
 *
 * 数据集是英文论文，如果用户输入「注意力机制」，纯词项匹配会全部落空。
 * 这里维护一张「中文术语 → 英文词项」的映射表，在查询阶段做一次改写，
 * 让中文提问也能召回英文文献。它不是机器翻译，只是受控词表 + 最长匹配，
 * 但足以支撑演示，而且逻辑完全可解释。
 */

export const TERM_DICT: Record<string, string[]> = {
  注意力机制: ['attention'],
  注意力: ['attention'],
  自注意力: ['self', 'attention'],
  检索: ['retrieval'],
  文献: ['paper', 'document'],
  论文: ['paper'],
  排序: ['ranking', 'rank'],
  重排: ['reranking'],
  排序模型: ['ranking', 'model'],
  向量: ['vector', 'embedding'],
  向量检索: ['vector', 'retrieval'],
  嵌入: ['embedding'],
  词向量: ['word', 'embedding'],
  稠密: ['dense'],
  稀疏: ['sparse'],
  分词: ['segmentation', 'tokenization'],
  中文分词: ['chinese', 'segmentation'],
  深度学习: ['deep', 'learning'],
  神经网络: ['neural', 'network'],
  卷积: ['convolutional'],
  循环神经网络: ['recurrent', 'neural'],
  预训练: ['pretrained', 'pretraining'],
  微调: ['fine', 'tuning'],
  迁移学习: ['transfer', 'learning'],
  目标检测: ['object', 'detection'],
  检测: ['detection'],
  图像: ['image'],
  图像分类: ['image', 'classification'],
  分割: ['segmentation'],
  生成: ['generation', 'generative'],
  生成模型: ['generative', 'model'],
  扩散: ['diffusion'],
  对抗: ['adversarial'],
  问答: ['question', 'answering'],
  检索增强: ['retrieval', 'augmented', 'generation'],
  推荐: ['recommendation'],
  推荐系统: ['recommendation', 'system'],
  分布式: ['distributed'],
  共识: ['consensus'],
  一致性: ['consistency'],
  复制: ['replication'],
  容错: ['fault', 'tolerance'],
  数据库: ['database'],
  文件系统: ['file', 'system'],
  键值: ['key', 'value'],
  过拟合: ['overfitting'],
  正则化: ['regularization'],
  优化器: ['optimizer'],
  梯度: ['gradient'],
  梯度提升: ['gradient', 'boosting'],
  决策树: ['decision', 'tree'],
  随机森林: ['random', 'forest'],
  集成学习: ['ensemble'],
  聚类: ['clustering'],
  谱聚类: ['spectral', 'clustering'],
  分类: ['classification'],
  数据集: ['dataset'],
  基准: ['benchmark'],
  评测: ['evaluation', 'benchmark'],
  指标: ['metric'],
  压缩: ['compression'],
  量化: ['quantization'],
  推理加速: ['inference', 'efficient'],
  服务: ['serving'],
  部署: ['serving', 'deployment'],
  长文本: ['long', 'context'],
  上下文: ['context'],
  语言模型: ['language', 'model'],
  大模型: ['large', 'language', 'model'],
  大语言模型: ['large', 'language', 'model'],
  机器翻译: ['machine', 'translation'],
  翻译: ['translation'],
  对比学习: ['contrastive', 'learning'],
  自监督: ['self', 'supervised'],
  表示学习: ['representation', 'learning'],
  知识图谱: ['knowledge', 'graph'],
  图: ['graph'],
  链接分析: ['link', 'analysis'],
  语义: ['semantic'],
  相似度: ['similarity'],
  近邻搜索: ['nearest', 'neighbor'],
  近似最近邻: ['approximate', 'nearest', 'neighbor'],
  查询扩展: ['query', 'expansion'],
  相关反馈: ['relevance', 'feedback'],
  倒排索引: ['inverted', 'index'],
  索引: ['index'],
  评测指标: ['ndcg', 'metric'],
  多模态: ['multimodal'],
  三维重建: ['3d', 'reconstruction'],
  渲染: ['rendering'],
};

const DICT_KEYS = Object.keys(TERM_DICT).sort((a, b) => b.length - a.length);

/** 扫描查询串，按最长匹配抽取中文术语，返回对应的英文词项 */
export function expandChineseTerms(query: string): string[] {
  const out: string[] = [];
  let rest = query;
  for (const key of DICT_KEYS) {
    if (rest.includes(key)) {
      out.push(...TERM_DICT[key]);
      rest = rest.split(key).join(' ');
    }
  }
  return out;
}
