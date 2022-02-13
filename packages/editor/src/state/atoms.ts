import {
  compileDomain,
  compileTrio,
  prepareState,
  stepUntilConvergence,
} from "@penrose/core";
import { atom, useRecoilCallback, CallbackInterface, AtomEffect } from "recoil";
import { v4 } from "uuid";
import {
  constructLayout,
  DiagramFilePointer,
  DomainFilePointer,
  FileContents,
  FileLocation,
  FilePointer,
  ILocalFileSystem,
  ILocalLocation,
  IWorkspace,
  IWorkspacePointer,
  SavedFile,
  DiagramFile,
  StyleFilePointer,
  SubstanceFilePointer,
  WorkspaceFile,
  WorkspacePointer,
  SubstanceFile,
  StyleFile,
  DomainFile,
} from "../types/FileSystem";
import localForage from "localforage";
import { toast } from "react-toastify";
import { retrieveFileFromPointer } from "./fileSystemActions";
import {
  Actions,
  DockLocation,
  Model,
  TabNode,
  TabSetNode,
} from "flexlayout-react";
import { cloneDeep, debounce, isEmpty, memoize } from "lodash";
import { TrioSelection } from "../components/DiagramInitializer";
// derived state with file contents and pointer both

// Adapted from https://stackoverflow.com/questions/34401098/remove-a-property-in-an-object-immutably#comment83640640_47227198
export const deleteProperty = (obj: any, key: string) => {
  const { [key]: _, ...newObj } = obj;
  return newObj;
};

// Defaults
const _today = new Date();
const todayName = `${
  _today.getMonth() + 1
}/${_today.getDate()}/${_today.getFullYear()}`;
const firstId = v4();

// Memoized so that we dont over-debounce unrelated saves
const debouncedSave = memoize((key: string) =>
  debounce(async (file: SavedFile) => {
    const saveFile = { ...file };
    if (saveFile.type === "diagram_file") {
      saveFile.contents = null;
    } else if (saveFile.type === "domain_file") {
      saveFile.cache = null;
    }
    await localForage.setItem(key, JSON.stringify(saveFile));
  }, 500)
);

const saveWorkspaceEffect: AtomEffect<IWorkspace> = ({ setSelf, onSet }) => {
  onSet(async (newWorkspace, _oldWorkspace) => {
    // HACK
    const oldWorkspace = _oldWorkspace as IWorkspace;
    // If updating a workspace that isn't saved yet to disk
    // TODO: does this prematurely save?
    if (
      newWorkspace.id === oldWorkspace.id &&
      newWorkspace.location.type !== "local"
    ) {
      console.log("forking");
      const id = v4();
      const name = `fork of ${oldWorkspace.name}`;
      const location: FileLocation = {
        type: "local",
        localStorageKey: `workspace-${id}`,
      };
      setSelf((workspace) => ({
        ...(workspace as IWorkspace),
        id,
        name,
        location,
      }));
      //   If updating a local workspace, save it
    } else if (
      newWorkspace.location.type === "local" &&
      !isEmpty(newWorkspace.openFiles)
    ) {
      const saveFile: WorkspaceFile = {
        type: "workspace_file",
        contents: newWorkspace,
        id: newWorkspace.id,
      };
      await debouncedSave(saveFile.id)(saveFile);
    }
  });
};

const defaultModel = constructLayout([
  {
    type: "tabset",
    weight: 100,
    children: [{ type: "tab", name: "examples", component: "examples" }],
  },
]);

export const layoutState = atom<Model>({
  key: "layoutState",
  default: defaultModel,
  //   necessary due to react flex layout
  dangerouslyAllowMutability: true,
});

export const useSetLayout = () =>
  useRecoilCallback(({ set }) => (model: Model) => {
    set(layoutState, model);
    set(workspaceState, (state) => ({ ...state, layout: model.toJson() }));
  });

export const workspaceState = atom<IWorkspace>({
  key: "workspaceState",
  default: {
    openFiles: {},
    location: {
      type: "local",
      localStorageKey: `workspace-${firstId}`,
    },
    name: todayName,
    id: firstId,
    creator: null,
    forkedFrom: null,
    layout: defaultModel.toJson(),
  },
  effects: [saveWorkspaceEffect],
});

export const fileContentsState = atom<FileContents>({
  key: "fileContents",
  default: {},
  //   necessary due to diagram extension
  dangerouslyAllowMutability: true,
});

export const localFileSystem = atom<ILocalFileSystem>({
  key: "localFileSystem",
  default: {
    workspace: {},
    substance: {},
    style: {},
    domain: {},
    diagram: {},
  },
});

/**
 * Hook to load a specified workspace
 */
export const useLoadWorkspace = () =>
  // TODO: useRecoilTransaction when it's stable
  useRecoilCallback(
    ({ set }: CallbackInterface) =>
      async (workspacePointer: WorkspacePointer) => {
        const loadedWorkspace = await retrieveFileFromPointer(workspacePointer);
        if (
          loadedWorkspace !== null &&
          loadedWorkspace.type === "workspace_file"
        ) {
          const fileContents: FileContents = {};
          for (let [id, ptr] of Object.entries(
            loadedWorkspace.contents.openFiles
          )) {
            const retrieved = await retrieveFileFromPointer(ptr);
            if (retrieved !== null) {
              fileContents[id] = retrieved;
            } else {
              toast.error(`Failed to load file ${id}`);
            }
          }
          //   const openDomains = Object.values(
          // loadedWorkspace.contents.openFiles
          //   ).filter(({ type }) => type === "domain");
          //   if (
          //     loadedWorkspace.contents.domainCache === null &&
          //     openDomains.length > 0
          //   ) {
          //     const res = compileDomain(
          //       fileContents[openDomains[0].id].contents as string
          //     );
          //     if (res.isOk()) {
          //       // set fileContents domain cache
          //       //   set(workspaceState, (state) => ({
          //       //     ...state,
          //       //     domainCache: res.value,
          //       //   }));
          //     } else {
          //       toast.warn("Couldn't compile domain for autocompletion");
          //     }
          //   }

          //   Empty layout to prevent NPE's
          set(layoutState, constructLayout([]));

          set(fileContentsState, fileContents);
          set(workspaceState, loadedWorkspace.contents);
          set(layoutState, Model.fromJson(loadedWorkspace.contents.layout));
        } else {
          toast.error(`Failed to load workspace ${workspacePointer.id}`);
        }
      }
  );

export const useOpenFileInWorkspace = () =>
  useRecoilCallback(({ set, snapshot }) => async (pointer: FilePointer) => {
    const workspace: IWorkspace = snapshot.getLoadable(workspaceState).contents;
    const layout = snapshot.getLoadable(layoutState).contents;
    // If file already open, jump to it
    if (pointer.id in workspace.openFiles) {
      layout.visitNodes((node: any) => {
        layout.visitNodes((node: any) => {
          if (
            node.getType() === "tab" &&
            (node as TabNode).getConfig() &&
            (node as TabNode).getConfig().id === pointer.id
          ) {
            layout.doAction(Actions.selectTab(node.getId()));
          }
        });
      });
    } else {
      const loadedFile = await retrieveFileFromPointer(pointer);
      //   TODO: if domain, fill cache
      if (loadedFile !== null) {
        set(fileContentsState, (state) => ({
          ...state,
          [pointer.id]: loadedFile,
        }));
        set(workspaceState, (state) => ({
          ...state,
          openFiles: { ...state.openFiles, [pointer.id]: pointer },
        }));
        if (!layout.getActiveTabset()) {
          layout.doAction(
            Actions.setActiveTabset(
              layout.getMaximizedTabset()?.getId() ?? "main"
            )
          );
        }
        layout.doAction(
          Actions.addNode(
            {
              type: "tab",
              component: "file",
              name: pointer.name,
              id: pointer.id,
              config: {
                id: pointer.id,
              },
            },
            // HACK: the fallback is fallible
            layout.getActiveTabset()?.getId() || "main",
            DockLocation.CENTER,
            -1,
            true
          )
        );
      } else {
        toast.error(`Failed to load file ${pointer.name}`);
      }
    }
  });

export const useUpdateNodeToDiagramCreator = () =>
  useRecoilCallback(
    ({ snapshot }) =>
      (node: TabNode) => {
        const layout: Model = snapshot.getLoadable(layoutState).contents;
        layout.doAction(
          Actions.updateNodeAttributes(node.getId(), {
            component: "diagram_initializer",
            name: "New Diagram",
          })
        );
      },
    [layoutState]
  );

export const useNewFileCreatorTab = () =>
  useRecoilCallback(
    ({ snapshot }) =>
      (node: TabSetNode) => {
        const layout: Model = snapshot.getLoadable(layoutState).contents;
        layout.doAction(
          Actions.addNode(
            {
              type: "tab",
              component: "new_tab",
              name: "New Tab",
              id: v4(),
              config: {
                id: v4(),
              },
            },
            node.getId(),
            DockLocation.CENTER,
            -1,
            true
          )
        );
      },
    [layoutState]
  );

const _closeWorkspaceFile = (set: any, id: string) => {
  set(workspaceState, (state: IWorkspace) => ({
    ...state,
    openFiles: deleteProperty(state.openFiles, id),
  }));
  set(fileContentsState, (fileContents: FileContents) =>
    deleteProperty(fileContents, id)
  );
};

export const useCloseWorkspaceFile = () =>
  useRecoilCallback(
    ({ set }) =>
      (id: string) =>
        _closeWorkspaceFile(set, id)
  );

export const useUpdateFile = () =>
  useRecoilCallback(
    ({ set, snapshot }) =>
      async (id: string, contents: string) => {
        const pointer: FilePointer =
          snapshot.getLoadable(workspaceState).contents.openFiles[id];
        const oldFile = snapshot.getLoadable(fileContentsState).contents[id];
        if (pointer.location.type !== "local") {
          const newId = v4();
          const newPointer: FilePointer = {
            ...pointer,
            id: newId,
            location: {
              type: "local",
              localStorageKey: `${pointer.type}-${newId}`,
            },
          };
          set(workspaceState, (state) => ({
            ...state,
            openFiles: { ...state.openFiles, [newPointer.id]: newPointer },
          }));
          const newFile = { ...oldFile, id: newId };
          set(fileContentsState, (state) => ({
            ...state,
            [newId]: newFile,
          }));
          const layout: Model = snapshot.getLoadable(layoutState).contents;

          // Find existing open editor and update its config's id
          layout.visitNodes((node) => {
            if (
              node.getType() === "tab" &&
              (node as TabNode).getConfig() &&
              (node as TabNode).getConfig().id === oldFile.id
            ) {
              layout.doAction(
                Actions.updateNodeAttributes(node.getId(), {
                  config: { id: newId },
                })
              );
            }
          });

          // This is to prevent NPE's while munging the config's pointer
          _closeWorkspaceFile(set, oldFile.id);
          await debouncedSave(newId)(newFile);

          // TODO: fileSystem
          // _setLocalFilePointer(dispatch, state, {
          //   add: pointer,
          //   remove: savedFile.id,
          // });
        } else {
          set(fileContentsState, (state) => ({
            ...state,
            [oldFile.id]: { ...oldFile, contents },
          }));
          await debouncedSave(oldFile.id)({ ...oldFile, contents });
        }
      }
  );

const _compileDiagram = async (
  diagramPointer: DiagramFilePointer,
  prevDiagramFile: DiagramFile,
  fileContents: FileContents,
  set: any
) => {
  const diagramFile = { ...prevDiagramFile };
  const substance = (fileContents[diagramPointer.substance.id] as SubstanceFile)
    .contents;
  const style = (fileContents[diagramPointer.style.id] as StyleFile).contents;
  const domain = (fileContents[diagramPointer.domain.id] as DomainFile)
    .contents;
  const compiledDomain = compileDomain(domain);
  if (compiledDomain.isOk()) {
    set(fileContentsState, (state: FileContents) => ({
      ...state,
      [diagramPointer.domain.id]: {
        ...state[diagramPointer.domain.id],
        cache: compiledDomain.value,
      },
    }));
  } else {
    toast.error("Couldn't compile domain");
    // set metadata error
    return;
  }
  const compileResult = compileTrio(domain, substance, style);
  if (compileResult.isOk()) {
    const initialState = await prepareState(compileResult.value);
    diagramFile.contents = initialState;
    set(fileContentsState, (state: FileContents) => ({
      ...state,
      [diagramPointer.id]: diagramFile,
    }));
    if (diagramFile.metadata.autostep) {
      const stepResult = stepUntilConvergence(initialState);
      if (stepResult.isOk()) {
        const convergedState = stepResult.value;
        diagramFile.contents = convergedState;
        set(fileContentsState, (state: FileContents) => ({
          ...state,
          [diagramPointer.id]: diagramFile,
        }));
        await debouncedSave(diagramFile.id)(diagramFile);
      } else {
        diagramFile.metadata.error = stepResult.error;
        set(fileContentsState, (state: FileContents) => ({
          ...state,
          [diagramFile.id]: diagramFile,
        }));
      }
    }
  } else {
    diagramFile.metadata.error = compileResult.error;
    set(fileContentsState, (state: FileContents) => ({
      ...state,
      [diagramFile.id]: diagramFile,
    }));
  }
};

export const useUpdateNodeToNewDiagram = () =>
  useRecoilCallback(
    ({ set, snapshot }) =>
      async (
        node: TabNode,
        trioSelection: TrioSelection,
        autostep: boolean
      ) => {
        const id = v4();
        const diagramPointer: DiagramFilePointer = {
          type: "diagram_state",
          id,
          substance: trioSelection.substance as SubstanceFilePointer,
          style: trioSelection.style as StyleFilePointer,
          domain: trioSelection.domain as DomainFilePointer,
          name: "Diagram",
          location: {
            type: "local",
            localStorageKey: `diagram-${id}`,
          },
        };
        const diagramFile: DiagramFile = {
          type: "diagram_file",
          id: diagramPointer.id,
          contents: null,
          metadata: {
            error: null,
            autostep: true,
          },
        };
        set(fileContentsState, (state) => ({
          ...state,
          [diagramFile.id]: diagramFile,
        }));
        set(workspaceState, (state) => ({
          ...state,
          openFiles: {
            ...state.openFiles,
            [diagramPointer.id]: diagramPointer,
          },
        }));
        const layout: Model = snapshot.getLoadable(layoutState).contents;
        layout.doAction(
          Actions.updateNodeAttributes(node.getId(), {
            component: "file",
            name: "Diagram",
            config: {
              id,
            },
          })
        );
        const fileContents = snapshot.getLoadable(fileContentsState).contents;
        await _compileDiagram(diagramPointer, diagramFile, fileContents, set);
      }
  );

export const useRecompileDiagram = () =>
  useRecoilCallback(
    ({ set, snapshot }) =>
      async (diagramPointer: DiagramFilePointer) => {
        const fileContents = snapshot.getLoadable(fileContentsState).contents;
        const diagramFile = fileContents[diagramPointer.id];
        await _compileDiagram(diagramPointer, diagramFile, fileContents, set);
      }
  );