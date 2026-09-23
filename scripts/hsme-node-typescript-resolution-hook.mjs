import {existsSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {extname} from 'node:path';
import {fileURLToPath} from 'node:url';

registerHooks({
  resolve(specifier,context,nextResolve){
    if(
      context.parentURL?.startsWith('file:')
      &&(specifier.startsWith('./')||specifier.startsWith('../'))
      &&extname(specifier)===''
    ){
      const candidate=new URL(specifier+'.ts',context.parentURL);
      if(existsSync(fileURLToPath(candidate))){
        return nextResolve(candidate.href,context);
      }
    }
    return nextResolve(specifier,context);
  },
});
