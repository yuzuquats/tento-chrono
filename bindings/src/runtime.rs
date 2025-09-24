use std::{
  path::{Path, PathBuf},
  rc::Rc,
};

use anyhow::anyhow;
use boa_engine::{
  Context as BoaContext, JsError, JsObject, JsValue, Module, builtins::promise::PromiseState,
  js_string, module::SimpleModuleLoader, property::Attribute,
};
use boa_parser::Source;
use boa_runtime::Console;

pub struct Runtime {
  pub loader: Rc<SimpleModuleLoader>,
  pub context: BoaContext,
  pkg_dir: PathBuf,
}

impl Runtime {
  pub fn new() -> anyhow::Result<Self> {
    let pkg_location =
      PathBuf::from(std::env::var("LONA_JS_CHRONO_OUTPUT_JS").expect("no package location"));
    let pkg_dir = PathBuf::from(std::fs::read_to_string(pkg_location)?);

    let loader = Rc::new(
      SimpleModuleLoader::new(&pkg_dir)
        .map_err(|e| anyhow!("couldn't create module loader: {e:?}"))?,
    );
    let mut context = BoaContext::builder()
      .module_loader(loader.clone())
      .build()
      .map_err(|e| anyhow!("couldn't build boa context: {e:?}"))?;

    let console = Console::init(&mut context);
    context
      .register_global_property(js_string!(Console::NAME), console, Attribute::all())
      .expect("console shouldn't exist yet");

    Ok(Runtime {
      loader,
      context,
      pkg_dir,
    })
  }

  pub fn eval_module(&mut self, src: &str) -> anyhow::Result<JsObject> {
    let source = Source::from_reader(src.as_bytes(), Some(Path::new("./main.mjs")));
    let module = Module::parse(source, None, &mut self.context)
      .map_err(|_| anyhow!("couldn't parse module src"))?;

    self.loader.insert(
      Path::new(&self.pkg_dir).canonicalize()?.join("main.mjs"),
      module.clone(),
    );

    let promise_result = module.load_link_evaluate(&mut self.context);
    self.context.run_jobs();
    match promise_result.state() {
      PromiseState::Pending => return Err(anyhow!("module didn't execute!")),
      PromiseState::Fulfilled(v) => {
        assert_eq!(v, JsValue::undefined());
      }
      PromiseState::Rejected(err) => {
        let e = JsError::from_opaque(err)
          .try_native(&mut self.context)
          .map_err(|_| anyhow!("promise rejected"))?;
        return Err(anyhow!("promise rejected: {e:?}"));
      }
    }

    let namespace = module.namespace(&mut self.context);
    Ok(namespace)
  }
}
