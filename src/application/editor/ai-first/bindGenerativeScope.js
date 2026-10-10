/**
 * Bind an AI Studio instruction to one exact Core source and an explicit edit scope.
 * This only validates the browser request. Server/Core remains responsible for
 * authorization, artifact lineage and enforcing changes outside a mask.
 */
const ID_LIMIT = 256;
const PROTECTED_TARGET = /(?:не\s+(?:меняй|меняя|трогай|трогая|изменяй|изменяя)|сохрани\s+(?:лицо|фон|кожу|волосы|человек|позу)|don't\s+(?:change|touch|alter)|preserve\s+(?:face|skin|hair|person|identity|background)|(?:замени|убери|удали|дорисуй|поменяй)\s+(?:небо|фон|объект|одежду|платье|человека|волосы)|change\s+(?:the\s+)?(?:background|hair|clothes)|remove\s+(?:the\s+)?(?:person|object))/iu;

function validId(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0 && value.length <= ID_LIMIT && !/[\x00-\x1f]/u.test(value);
}

export function bindGenerativeScope({
  instruction, mode, projectId, expectedProjectId,
  sourceArtifactId, expectedSourceArtifactId,
  expectedSelectedObjectId = null, expectedMaskArtifactId = null, objects = [],
}) {
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 850)
    throw new Error('Команда генерации отсутствует или слишком длинная.');
  if (!validId(projectId) || !validId(expectedProjectId) || !validId(sourceArtifactId) || !validId(expectedSourceArtifactId))
    throw new Error('Проект или исходное фото недоступны для генерации.');
  if (projectId !== expectedProjectId)
    throw new Error('Проект изменился. Проверьте область и подтвердите команду заново.');
  if (sourceArtifactId !== expectedSourceArtifactId)
    throw new Error('Исходная фотография изменилась. Проверьте область и подтвердите команду снова.');
  if (!Array.isArray(objects))
    throw new Error('Не удалось проверить выбор объекта.');

  if (mode === 'WHOLE_IMAGE') {
    if (expectedSelectedObjectId !== null || expectedMaskArtifactId !== null)
      throw new Error('Для изменения всего кадра не должна подтверждаться объектная маска.');
    if (PROTECTED_TARGET.test(instruction))
      throw new Error('Команда требует сохранения или изменения конкретного объекта. Выберите маску этой области.');
    return Object.freeze({
      sourceArtifactId, selectedObjectIds: Object.freeze([]),
      maskArtifactIds: Object.freeze([]), scope: 'WHOLE_IMAGE',
    });
  }
  if (mode !== 'MASKED')
    throw new Error('Неизвестный режим генерации.');
  const selected = objects.filter(object => object?.selected);
  if (selected.length !== 1)
    throw new Error('Для точного изменения выберите ровно один объект с Core-маской.');
  const object = selected[0];
  if (!validId(object.id) || !validId(object.mask_artifact_id))
    throw new Error('Выделение не содержит сохранённой Core-маски.');
  if (!validId(expectedSelectedObjectId) || object.id !== expectedSelectedObjectId)
    throw new Error('Выбран другой объект. Проверьте выделение и подтвердите команду заново.');
  if (!validId(expectedMaskArtifactId) || object.mask_artifact_id !== expectedMaskArtifactId)
    throw new Error('Маска изменилась. Проверьте её и подтвердите правку заново.');
  return Object.freeze({
    sourceArtifactId, selectedObjectIds: Object.freeze([object.id]),
    maskArtifactIds: Object.freeze([object.mask_artifact_id]), scope: 'MASKED',
  });
}
