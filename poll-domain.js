// Browser compatibility helpers. Firestore rules remain the authority.
export const POLL_MAX_OPTIONS=4, POLL_MAX_LABEL=90;
export function validatePollOptions(options){
  if(!Array.isArray(options)||options.length<2||options.length>POLL_MAX_OPTIONS)throw new Error('Informe de duas a quatro opções para a enquete.');
  if(options.some(label=>typeof label!=='string'||!label.trim()||label!==label.trim()||label.length>POLL_MAX_LABEL||/[\r\n]/.test(label)))throw new Error('Use opções de até 90 caracteres, sem linhas em branco.');
  if(new Set(options.map(label=>label.toLowerCase())).size!==options.length)throw new Error('As opções da enquete devem ser diferentes.');
  return options;
}
export function voteIndex(option,options){
  if(!Array.isArray(options))return null;
  if(Number.isInteger(option))return option>=0&&option<options.length?option:null;
  // Never coerce "1" to an index: it can be a real legacy option label.
  if(typeof option==='string'){
    const index=options.indexOf(option);
    return index>=0&&options.lastIndexOf(option)===index?index:null;
  }
  return null;
}
export function assertVoteIndex(index,post){
  if(post?.type!=='poll'||!Number.isInteger(index)||voteIndex(index,post.pollOptions)===null)throw new Error('Opção de enquete inválida. Atualize a publicação e tente novamente.');
  return index;
}
