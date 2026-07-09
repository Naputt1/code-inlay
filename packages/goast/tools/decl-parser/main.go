package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"os"
	"strconv"
	"strings"
)

var formatFlag = flag.String("format", "ast", "output format: ast (full AST) or summary (declaration summary)")

func main() {
	flag.Parse()

	source, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(fmt.Sprintf("reading stdin: %v", err))
		return
	}

	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "", source, parser.ParseComments)
	if err != nil {
		writeError(fmt.Sprintf("parsing Go source: %v", err))
		return
	}

	switch *formatFlag {
	case "summary":
		outputSummary(f, fset, source)
	default:
		outputAST(f, fset)
	}
}

func outputAST(f *ast.File, fset *token.FileSet) {
	fileNode := toJSON(f, fset).(map[string]any)
	imports := fileNode["imports"].([]any)
	decls := fileNode["decls"].([]any)
	result := map[string]any{
		"file":         fileNode,
		"imports":      imports,
		"declarations": decls,
	}
	out, err := json.Marshal(result)
	if err != nil {
		writeError(fmt.Sprintf("marshaling JSON: %v", err))
		return
	}
	fmt.Println(string(out))
}

func outputSummary(f *ast.File, fset *token.FileSet, source []byte) {
	var decls []map[string]any

	// Extract imports as a synthetic declaration
	var imports []string
	for _, imp := range f.Imports {
		if imp.Path != nil {
			path, _ := strconv.Unquote(imp.Path.Value)
			if imp.Name != nil {
				imports = append(imports, imp.Name.Name+" \""+path+"\"")
			} else {
				imports = append(imports, "\""+path+"\"")
			}
		}
	}
	if len(imports) > 0 {
		decls = append(decls, map[string]any{
			"kind":      "imports",
			"imports":   imports,
			"startLine": fset.Position(f.Package).Line,
		})
	}

	// Extract top-level declarations
	for _, decl := range f.Decls {
		switch d := decl.(type) {
		case *ast.GenDecl:
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					start := fset.Position(d.Pos())
					end := fset.Position(d.End())
					sig := sourceBetween(source, d.Pos(), d.End(), fset)
					bodyStart := 0
					bodyEnd := 0
					var body string
					if st, ok := s.Type.(*ast.StructType); ok && st.Fields != nil && st.Fields.List != nil {
						bodyStart = fset.Position(st.Fields.Opening).Line
						bodyEnd = fset.Position(st.Fields.Closing).Line
						bodyOff := fset.Position(st.Fields.Opening).Offset + 1
						bodyEndOff := fset.Position(st.Fields.Closing).Offset
						if bodyOff >= 0 && bodyEndOff <= len(source) && bodyOff < bodyEndOff {
							body = string(source[bodyOff:bodyEndOff])
						}
					}
					if it, ok := s.Type.(*ast.InterfaceType); ok && it.Methods != nil && it.Methods.List != nil {
						bodyStart = fset.Position(it.Methods.Opening).Line
						bodyEnd = fset.Position(it.Methods.Closing).Line
						bodyOff := fset.Position(it.Methods.Opening).Offset + 1
						bodyEndOff := fset.Position(it.Methods.Closing).Offset
						if bodyOff >= 0 && bodyEndOff <= len(source) && bodyOff < bodyEndOff {
							body = string(source[bodyOff:bodyEndOff])
						}
					}
					decls = append(decls, map[string]any{
						"kind":       typeKind(s),
						"symbolName": s.Name.Name,
						"signature":  sig,
						"body":       body,
						"bodyStart":  bodyStart,
						"bodyEnd":    bodyEnd,
						"startLine":  start.Line,
						"endLine":    end.Line,
					})
				case *ast.ValueSpec:
					start := fset.Position(d.Pos())
					end := fset.Position(d.End())
					sig := sourceBetween(source, d.Pos(), d.End(), fset)
					for _, name := range s.Names {
						kind := "var"
						if d.Tok.String() == "const" {
							kind = "const"
						}
						decls = append(decls, map[string]any{
							"kind":       kind,
							"symbolName": name.Name,
							"signature":  sig,
							"startLine":  start.Line,
							"endLine":    end.Line,
						})
					}
				}
			}
		case *ast.FuncDecl:
			start := fset.Position(d.Pos())
			end := fset.Position(d.End())
			kind := "function"
			var receiver string
			symbolName := d.Name.Name
			if d.Recv != nil && len(d.Recv.List) > 0 {
				kind = "method"
				recvType := exprString(d.Recv.List[0].Type)
				recvName := ""
				if len(d.Recv.List[0].Names) > 0 {
					recvName = d.Recv.List[0].Names[0].Name + " "
				}
				receiver = recvName + recvType
				recvBase := strings.TrimLeft(recvType, "*")
				if idx := strings.IndexAny(recvBase, "["); idx >= 0 {
					recvBase = recvBase[:idx]
				}
				symbolName = recvBase + "." + d.Name.Name
			}
			var sig string
			var body string
			bodyStart := 0
			bodyEnd := 0
			if d.Body != nil {
				sig = sourceBetween(source, d.Pos(), d.Type.End(), fset)
				bodyStart = fset.Position(d.Body.Lbrace).Line
				bodyEnd = fset.Position(d.Body.Rbrace).Line
				bodyOff := fset.Position(d.Body.Lbrace).Offset + 1
				bodyEndOff := fset.Position(d.Body.Rbrace).Offset
				if bodyOff >= 0 && bodyEndOff <= len(source) && bodyOff < bodyEndOff {
					body = string(source[bodyOff:bodyEndOff])
				}
			} else {
				sig = sourceBetween(source, d.Pos(), d.End(), fset)
			}
			decls = append(decls, map[string]any{
				"kind":       kind,
				"symbolName": symbolName,
				"receiver":   receiver,
				"signature":  sig,
				"body":       body,
				"bodyStart":  bodyStart,
				"bodyEnd":    bodyEnd,
				"startLine":  start.Line,
				"endLine":    end.Line,
			})
		}
	}

	out, err := json.Marshal(decls)
	if err != nil {
		writeError(fmt.Sprintf("marshaling JSON: %v", err))
		return
	}
	fmt.Println(string(out))
}

func typeKind(s *ast.TypeSpec) string {
	switch s.Type.(type) {
	case *ast.StructType:
		return "struct"
	case *ast.InterfaceType:
		return "interface"
	default:
		return "type"
	}
}

func exprString(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.StarExpr:
		return "*" + exprString(e.X)
	case *ast.Ident:
		return e.Name
	case *ast.SelectorExpr:
		return exprString(e.X) + "." + e.Sel.Name
	case *ast.ArrayType:
		return "[]" + exprString(e.Elt)
	case *ast.IndexExpr:
		return exprString(e.X) + "[" + exprString(e.Index) + "]"
	case *ast.IndexListExpr:
		args := make([]string, len(e.Indices))
		for i, idx := range e.Indices {
			args[i] = exprString(idx)
		}
		return exprString(e.X) + "[" + strings.Join(args, ", ") + "]"
	default:
		return fmt.Sprintf("%T", e)
	}
}

func sourceBetween(source []byte, start, end token.Pos, fset *token.FileSet) string {
	s := fset.Position(start).Offset
	e := fset.Position(end).Offset
	if s >= 0 && e <= len(source) && s < e {
		return string(source[s:e])
	}
	return ""
}

func writeError(msg string) {
	out, _ := json.Marshal(map[string]string{"kind": "ParseError", "message": msg})
	fmt.Println(string(out))
}

// ─── Core recursive AST converter ─────────────────────────────

func toJSON(node ast.Node, fset *token.FileSet) any {
	if node == nil {
		return nil
	}

	switch n := node.(type) {

	// ── File ────────────────────────────────────────────────
	case *ast.File:
		decls := make([]any, 0, len(n.Decls))
		for _, d := range n.Decls {
			if j := toJSON(d, fset); j != nil {
				decls = append(decls, j)
			}
		}
		imps := make([]any, 0, len(n.Imports))
		for _, imp := range n.Imports {
			if j := toJSON(imp, fset); j != nil {
				imps = append(imps, j)
			}
		}
		m := map[string]any{
			"kind":        "File",
			"packageName": n.Name.Name,
			"imports":     imps,
			"decls":       decls,
		}
		if len(n.Comments) > 0 {
			cgs := make([]any, len(n.Comments))
			for i, cg := range n.Comments {
				cgs[i] = toJSON(cg, fset)
			}
			m["comments"] = cgs
		}
		return m

	// ── Comments ───────────────────────────────────────────
	case *ast.CommentGroup:
		list := make([]any, len(n.List))
		for i, c := range n.List {
			list[i] = toJSON(c, fset)
		}
		return map[string]any{"kind": "CommentGroup", "list": list}

	case *ast.Comment:
		return map[string]any{"kind": "Comment", "text": n.Text}

	// ── Declarations ───────────────────────────────────────
	case *ast.FuncDecl:
		m := map[string]any{
			"kind": "FuncDecl",
			"name": n.Name.Name,
			"type": toJSON(n.Type, fset),
		}
		if n.Recv != nil && len(n.Recv.List) > 0 {
			m["recv"] = fieldToJSON(n.Recv.List[0], fset)
		}
		if n.Type.TypeParams != nil && len(n.Type.TypeParams.List) > 0 {
			m["typeParams"] = fieldsToJSON(n.Type.TypeParams.List, fset)
		}
		if n.Body != nil {
			m["body"] = toJSON(n.Body, fset)
		}
		if n.Doc != nil {
			m["doc"] = toJSON(n.Doc, fset)
		}
		return m

	case *ast.GenDecl:
		specs := make([]any, 0, len(n.Specs))
		for _, s := range n.Specs {
			if j := toJSON(s, fset); j != nil {
				specs = append(specs, j)
			}
		}
		m := map[string]any{
			"kind":  "GenDecl",
			"token": n.Tok.String(),
			"specs": specs,
		}
		if n.Lparen.IsValid() {
			m["lparen"] = true
		}
		if n.Doc != nil {
			m["doc"] = toJSON(n.Doc, fset)
		}
		return m

	// ── Specs ──────────────────────────────────────────────
	case *ast.ImportSpec:
		path, _ := strconv.Unquote(n.Path.Value)
		m := map[string]any{
			"kind": "ImportSpec",
			"path": path,
		}
		if n.Name != nil {
			m["name"] = n.Name.Name
		}
		if n.Doc != nil {
			m["doc"] = toJSON(n.Doc, fset)
		}
		if n.Comment != nil {
			m["comment"] = toJSON(n.Comment, fset)
		}
		return m

	case *ast.TypeSpec:
		m := map[string]any{
			"kind": "TypeSpec",
			"name": n.Name.Name,
			"type": toJSON(n.Type, fset),
		}
		if n.TypeParams != nil && len(n.TypeParams.List) > 0 {
			m["typeParams"] = fieldsToJSON(n.TypeParams.List, fset)
		}
		if n.Assign.IsValid() {
			m["assign"] = true
		}
		if n.Doc != nil {
			m["doc"] = toJSON(n.Doc, fset)
		}
		return m

	case *ast.ValueSpec:
		names := make([]string, len(n.Names))
		for i, name := range n.Names {
			names[i] = name.Name
		}
		m := map[string]any{
			"kind":  "ValueSpec",
			"names": names,
		}
		if n.Type != nil {
			m["type"] = toJSON(n.Type, fset)
		}
		if len(n.Values) > 0 {
			vals := make([]any, len(n.Values))
			for i, v := range n.Values {
				vals[i] = toJSON(v, fset)
			}
			m["values"] = vals
		}
		if n.Doc != nil {
			m["doc"] = toJSON(n.Doc, fset)
		}
		return m

	// ── Types / Expressions ────────────────────────────────
	case *ast.Ident:
		return map[string]any{"kind": "Ident", "name": n.Name}

	case *ast.StarExpr:
		return map[string]any{"kind": "StarExpr", "x": toJSON(n.X, fset)}

	case *ast.SelectorExpr:
		return map[string]any{"kind": "SelectorExpr", "x": toJSON(n.X, fset), "sel": n.Sel.Name}

	case *ast.ParenExpr:
		return map[string]any{"kind": "ParenExpr", "x": toJSON(n.X, fset)}

	// ── Types ─────────────────────────────────────────────
	case *ast.ArrayType:
		if n.Len == nil {
			return map[string]any{"kind": "SliceType", "elt": toJSON(n.Elt, fset)}
		}
		return map[string]any{"kind": "ArrayType", "len": toJSON(n.Len, fset), "elt": toJSON(n.Elt, fset)}

	case *ast.MapType:
		return map[string]any{"kind": "MapType", "key": toJSON(n.Key, fset), "value": toJSON(n.Value, fset)}

	case *ast.StructType:
		fields := []any{}
		if n.Fields != nil {
			fields = fieldsToJSON(n.Fields.List, fset)
		}
		return map[string]any{"kind": "StructType", "fields": fields}

	case *ast.InterfaceType:
		methods := []any{}
		if n.Methods != nil {
			methods = fieldsToJSON(n.Methods.List, fset)
		}
		return map[string]any{"kind": "InterfaceType", "methods": methods}

	case *ast.FuncType:
		m := map[string]any{
			"kind":   "FuncType",
			"params": fieldsToJSON(n.Params.List, fset),
		}
		if n.TypeParams != nil && len(n.TypeParams.List) > 0 {
			m["typeParams"] = fieldsToJSON(n.TypeParams.List, fset)
		}
		if n.Results != nil && len(n.Results.List) > 0 {
			m["results"] = fieldsToJSON(n.Results.List, fset)
		}
		return m

	case *ast.ChanType:
		dir := "both"
		if n.Dir == ast.SEND {
			dir = "send"
		} else if n.Dir == ast.RECV {
			dir = "recv"
		}
		return map[string]any{"kind": "ChanType", "dir": dir, "value": toJSON(n.Value, fset)}

	// ── Expressions ───────────────────────────────────────
	case *ast.BadExpr:
		return map[string]any{"kind": "BadExpr"}

	case *ast.BasicLit:
		return map[string]any{
			"kind":  "BasicLit",
			"token": tokToLitToken(n.Kind),
			"value": n.Value,
		}

	case *ast.FuncLit:
		return map[string]any{
			"kind": "FuncLit",
			"type": toJSON(n.Type, fset),
			"body": toJSON(n.Body, fset),
		}

	case *ast.CompositeLit:
		elts := make([]any, len(n.Elts))
		for i, elt := range n.Elts {
			elts[i] = toJSON(elt, fset)
		}
		m := map[string]any{
			"kind": "CompositeLit",
			"elts": elts,
		}
		if n.Type != nil {
			m["type"] = toJSON(n.Type, fset)
		}
		if n.Incomplete {
			m["incomplete"] = true
		}
		return m

	case *ast.IndexExpr:
		return map[string]any{
			"kind":  "IndexExpr",
			"x":     toJSON(n.X, fset),
			"index": toJSON(n.Index, fset),
		}

	case *ast.SliceExpr:
		m := map[string]any{
			"kind": "SliceExpr",
			"x":    toJSON(n.X, fset),
		}
		if n.Low != nil {
			m["low"] = toJSON(n.Low, fset)
		}
		if n.High != nil {
			m["high"] = toJSON(n.High, fset)
		}
		if n.Max != nil {
			m["max"] = toJSON(n.Max, fset)
		}
		return m

	case *ast.TypeAssertExpr:
		m := map[string]any{
			"kind": "TypeAssertExpr",
			"x":    toJSON(n.X, fset),
		}
		if n.Type != nil {
			m["type"] = toJSON(n.Type, fset)
		}
		return m

	case *ast.CallExpr:
		args := make([]any, len(n.Args))
		for i, a := range n.Args {
			args[i] = toJSON(a, fset)
		}
		m := map[string]any{
			"kind": "CallExpr",
			"func": toJSON(n.Fun, fset),
			"args": args,
		}
		if n.Ellipsis.IsValid() {
			m["ellipsis"] = true
		}
		return m

	case *ast.UnaryExpr:
		return map[string]any{
			"kind": "UnaryExpr",
			"op":   n.Op.String(),
			"x":    toJSON(n.X, fset),
		}

	case *ast.BinaryExpr:
		return map[string]any{
			"kind": "BinaryExpr",
			"x":    toJSON(n.X, fset),
			"op":   n.Op.String(),
			"y":    toJSON(n.Y, fset),
		}

	case *ast.KeyValueExpr:
		return map[string]any{
			"kind":  "KeyValueExpr",
			"key":   toJSON(n.Key, fset),
			"value": toJSON(n.Value, fset),
		}

	// ── Statements ────────────────────────────────────────
	case *ast.DeclStmt:
		return map[string]any{"kind": "DeclStmt", "decl": toJSON(n.Decl, fset)}

	case *ast.EmptyStmt:
		return map[string]any{"kind": "EmptyStmt"}

	case *ast.LabeledStmt:
		return map[string]any{
			"kind":  "LabeledStmt",
			"label": n.Label.Name,
			"stmt":  toJSON(n.Stmt, fset),
		}

	case *ast.ExprStmt:
		return map[string]any{"kind": "ExprStmt", "expr": toJSON(n.X, fset)}

	case *ast.SendStmt:
		return map[string]any{
			"kind":  "SendStmt",
			"chan":  toJSON(n.Chan, fset),
			"value": toJSON(n.Value, fset),
		}

	case *ast.IncDecStmt:
		return map[string]any{
			"kind":  "IncDecStmt",
			"expr":  toJSON(n.X, fset),
			"token": n.Tok.String(),
		}

	case *ast.AssignStmt:
		lhs := make([]any, len(n.Lhs))
		for i, l := range n.Lhs {
			lhs[i] = toJSON(l, fset)
		}
		rhs := make([]any, len(n.Rhs))
		for i, r := range n.Rhs {
			rhs[i] = toJSON(r, fset)
		}
		return map[string]any{
			"kind":  "AssignStmt",
			"lhs":   lhs,
			"token": n.Tok.String(),
			"rhs":   rhs,
		}

	case *ast.GoStmt:
		return map[string]any{
			"kind": "GoStmt",
			"call": toJSON(n.Call, fset),
		}

	case *ast.DeferStmt:
		return map[string]any{
			"kind": "DeferStmt",
			"call": toJSON(n.Call, fset),
		}

	case *ast.ReturnStmt:
		results := make([]any, len(n.Results))
		for i, r := range n.Results {
			results[i] = toJSON(r, fset)
		}
		return map[string]any{
			"kind":    "ReturnStmt",
			"results": results,
		}

	case *ast.BranchStmt:
		m := map[string]any{
			"kind":  "BranchStmt",
			"token": n.Tok.String(),
		}
		if n.Label != nil {
			m["label"] = n.Label.Name
		}
		return m

	case *ast.BlockStmt:
		list := make([]any, len(n.List))
		for i, s := range n.List {
			list[i] = toJSON(s, fset)
		}
		return map[string]any{"kind": "BlockStmt", "list": list}

	case *ast.IfStmt:
		m := map[string]any{
			"kind": "IfStmt",
			"cond": toJSON(n.Cond, fset),
			"body": toJSON(n.Body, fset),
		}
		if n.Init != nil {
			m["init"] = toJSON(n.Init, fset)
		}
		if n.Else != nil {
			m["elseStmt"] = toJSON(n.Else, fset)
		}
		return m

	case *ast.SwitchStmt:
		m := map[string]any{
			"kind": "SwitchStmt",
			"body": toJSON(n.Body, fset),
		}
		if n.Init != nil {
			m["init"] = toJSON(n.Init, fset)
		}
		if n.Tag != nil {
			m["tag"] = toJSON(n.Tag, fset)
		}
		return m

	case *ast.TypeSwitchStmt:
		m := map[string]any{
			"kind":   "TypeSwitchStmt",
			"assign": toJSON(n.Assign, fset),
			"body":   toJSON(n.Body, fset),
		}
		if n.Init != nil {
			m["init"] = toJSON(n.Init, fset)
		}
		return m

	case *ast.SelectStmt:
		return map[string]any{
			"kind": "SelectStmt",
			"body": toJSON(n.Body, fset),
		}

	case *ast.ForStmt:
		m := map[string]any{
			"kind": "ForStmt",
			"body": toJSON(n.Body, fset),
		}
		if n.Init != nil {
			m["init"] = toJSON(n.Init, fset)
		}
		if n.Cond != nil {
			m["cond"] = toJSON(n.Cond, fset)
		}
		if n.Post != nil {
			m["post"] = toJSON(n.Post, fset)
		}
		return m

	case *ast.RangeStmt:
		m := map[string]any{
			"kind":  "RangeStmt",
			"token": n.Tok.String(),
			"expr":  toJSON(n.X, fset),
			"body":  toJSON(n.Body, fset),
		}
		if n.Key != nil {
			m["key"] = toJSON(n.Key, fset)
		}
		if n.Value != nil {
			m["value"] = toJSON(n.Value, fset)
		}
		return m

	case *ast.CaseClause:
		values := make([]any, len(n.List))
		for i, v := range n.List {
			values[i] = toJSON(v, fset)
		}
		body := make([]any, len(n.Body))
		for i, s := range n.Body {
			body[i] = toJSON(s, fset)
		}
		return map[string]any{
			"kind":   "CaseClause",
			"values": values,
			"body":   body,
		}

	case *ast.CommClause:
		body := make([]any, len(n.Body))
		for i, s := range n.Body {
			body[i] = toJSON(s, fset)
		}
		m := map[string]any{
			"kind": "CommClause",
			"body": body,
		}
		if n.Comm != nil {
			m["comm"] = toJSON(n.Comm, fset)
		}
		return m

	case *ast.Ellipsis:
		return nil
	case *ast.BadDecl:
		return nil
	default:
		return nil
	}
}

// ─── Field helpers ───────────────────────────────────────────

func fieldsToJSON(fields []*ast.Field, fset *token.FileSet) []any {
	if fields == nil {
		return []any{}
	}
	result := make([]any, len(fields))
	for i, f := range fields {
		result[i] = fieldToJSON(f, fset)
	}
	return result
}

func fieldToJSON(f *ast.Field, fset *token.FileSet) any {
	names := make([]string, len(f.Names))
	for i, name := range f.Names {
		names[i] = name.Name
	}

	var typ any
	variadic := false

	if ellipsis, ok := f.Type.(*ast.Ellipsis); ok {
		variadic = true
		typ = toJSON(ellipsis.Elt, fset)
	} else {
		typ = toJSON(f.Type, fset)
	}

	m := map[string]any{
		"kind":     "Field",
		"names":    names,
		"type":     typ,
		"embedded": len(f.Names) == 0,
		"variadic": variadic,
	}

	if f.Tag != nil {
		tag := strings.Trim(f.Tag.Value, "`")
		m["tag"] = tag
	}

	if f.Doc != nil {
		m["doc"] = toJSON(f.Doc, fset)
	}
	if f.Comment != nil {
		m["comment"] = toJSON(f.Comment, fset)
	}

	return m
}

// ─── Token helpers ──────────────────────────────────────────

func tokToLitToken(kind token.Token) string {
	switch kind {
	case token.INT:
		return "int"
	case token.FLOAT:
		return "float"
	case token.STRING:
		return "string"
	case token.CHAR:
		return "char"
	case token.IMAG:
		return "imag"
	default:
		return "int"
	}
}
