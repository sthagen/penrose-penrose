import * as BBox from "engine/BBox";
import { VarAD } from "types/ad";
import {
  IBoolV,
  IColorV,
  IFloatV,
  IMatrixV,
  IPtListV,
  IStrV,
  IVectorV,
} from "types/value";

export interface IShape {
  shapeType: string;
  bbox(): BBox.BBox;
}

export interface INamed {
  name: IStrV;
}

export interface IStroke {
  strokeWidth: IFloatV<VarAD>;
  strokeStyle: IStrV;
  strokeColor: IColorV<VarAD>;
  strokeDashArray: IStrV;
  strokeOpacity: IFloatV<VarAD>;
}

export interface IFill {
  fillColor: IColorV<VarAD>;
  fillOpacity: IFloatV<VarAD>;
}

export interface ICenter {
  center: IVectorV<VarAD>;
}

export interface IRect {
  width: IFloatV<VarAD>;
  height: IFloatV<VarAD>;
}

export interface ILine {
  start: IVectorV<VarAD>;
  end: IVectorV<VarAD>;
}

export interface IArrow {
  arrowheadSize: IFloatV<VarAD>;
  arrowheadStyle: IStrV;
  startArrowhead: IBoolV<VarAD>;
  endArrowhead: IBoolV<VarAD>;
}

export interface ICorner {
  cornerRadius: IFloatV<VarAD>;
}

export interface ITransform {
  matrix: IMatrixV<VarAD>;
}

export interface IPoly {
  points: IPtListV<VarAD>;
}