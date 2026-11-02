import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePollOptions,voteIndex,assertVoteIndex} from '../poll-domain.js';
test('two to four distinct labels are accepted without changing user text',()=>{
 for(const labels of [['A','B'],['A','B','C'],['0','1','Épico','Coop']])assert.equal(validatePollOptions(labels),labels);
});
test('malformed options cannot become a valid new poll',()=>{
 for(const labels of [null,{},[],['A'],['A','B','C','D','E'],['A',null],['A',{}],['A',''],['A','  '],['A',' B'],['A','B\nC'],['A','B'.repeat(91)]])assert.throws(()=>validatePollOptions(labels));
});
test('duplicates are rejected even if they differ only in case',()=>{
 for(const labels of [['A','a'],['Ótimo','ótimo'],['A','B','a'],['A','B','C','b']])assert.throws(()=>validatePollOptions(labels));
});
test('numeric votes and legacy text votes select the same real option',()=>{
 const labels=['RPG','FPS','Coop'];
 assert.equal(voteIndex(1,labels),1);assert.equal(voteIndex('FPS',labels),1);assert.equal(voteIndex('Coop',labels),2);
});
test('numeric-looking labels are never coerced to an unrelated index',()=>{
 assert.equal(voteIndex('1',['1','0']),0);assert.equal(voteIndex(1,['1','0']),1);assert.equal(voteIndex('1',['A','B']),null);
});
test('untrusted vote values cannot choose outside the poll',()=>{
 for(const value of [-1,2,999,0.5,NaN,Infinity,null,undefined,{},[],true,'missing'])assert.equal(voteIndex(value,['A','B']),null);
 assert.equal(voteIndex(0,null),null);
});
test('ambiguous legacy labels are left unselected rather than inventing an answer',()=>{
 assert.equal(voteIndex('A',['A','A']),null);assert.equal(voteIndex(1,['A','A']),1);
});
test('existing polls with more than four options remain readable and votable',()=>{
 const post={type:'poll',pollOptions:['A','B','C','D','E']};assert.equal(voteIndex('E',post.pollOptions),4);assert.equal(assertVoteIndex(4,post),4);
});
test('new clients write integer indexes only and refuse missing/non-poll targets',()=>{
 const post={type:'poll',pollOptions:['A','B']};assert.equal(assertVoteIndex(1,post),1);
 for(const value of ['1','B',-1,2,0.5])assert.throws(()=>assertVoteIndex(value,post));
 assert.throws(()=>assertVoteIndex(0,{type:'text',pollOptions:['A','B']}));assert.throws(()=>assertVoteIndex(0));
});
